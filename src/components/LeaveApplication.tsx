import { useState, useEffect, useCallback } from 'react';
import {
  FileText, ChevronLeft, Calendar, User as UserIcon,
  AlertCircle, CheckCircle2, Loader2, Info, CreditCard,
  Clock, Sun, Sunset, Paperclip, X, ExternalLink,
} from 'lucide-react';
import { User, LeaveType, LeaveMode, HalfDayPeriod, PaymentStatus, LeaveCredits } from '../types';
import { getLeaveCredits, submitLeaveApplication } from '../utils/sheets';

interface Props {
  user: User;
  onBack: () => void;
}

const LEAVE_TYPES: LeaveType[] = ['Vacation Leave', 'Sick Leave', 'Birthday Leave', 'Emergency Leave'];

const LEAVE_COLORS: Record<LeaveType, string> = {
  'Vacation Leave':  'from-blue-500 to-cyan-500',
  'Sick Leave':      'from-red-500 to-rose-500',
  'Birthday Leave':  'from-pink-500 to-purple-500',
  'Emergency Leave': 'from-orange-500 to-amber-500',
};

const LEAVE_ICONS: Record<LeaveType, string> = {
  'Vacation Leave':  '🏖️',
  'Sick Leave':      '🏥',
  'Birthday Leave':  '🎂',
  'Emergency Leave': '🚨',
};

function getDatesBetween(start: string, end: string): string[] {
  if (!start || !end) return [];
  const dates: string[] = [];
  const cur = new Date(start);
  const last = new Date(end);
  while (cur <= last) {
    dates.push(cur.toISOString().split('T')[0]);
    cur.setDate(cur.getDate() + 1);
  }
  return dates;
}

export default function LeaveApplication({ user, onBack }: Props) {
  const emp = user.employee;

  const [leaveType, setLeaveType] = useState<LeaveType>('Vacation Leave');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [mode, setMode] = useState<LeaveMode>('Full Day');
  const [halfDayPeriod, setHalfDayPeriod] = useState<HalfDayPeriod>('AM');
  const [paymentStatus, setPaymentStatus] = useState<PaymentStatus>('Paid');
  const [reason, setReason] = useState('');
  const [documentFile, setDocumentFile] = useState<File | null>(null);
  const [documentUrl, setDocumentUrl] = useState('');
  const [credits, setCredits] = useState<LeaveCredits | null>(null);
  const [creditsLoading, setCreditsLoading] = useState(false);
  const [creditsError, setCreditsError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [submittedDocUrl, setSubmittedDocUrl] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  // ── Rules enforcement ──────────────────────────────────────────
  const isEmergency = leaveType === 'Emergency Leave';
  const isBirthday  = leaveType === 'Birthday Leave';

  // Emergency → always Unpaid
  useEffect(() => {
    if (isEmergency) setPaymentStatus('Unpaid');
  }, [isEmergency]);

  // Birthday → Full Day only
  useEffect(() => {
    if (isBirthday) setMode('Full Day');
  }, [isBirthday]);

  // Fetch credits when user loads
  useEffect(() => {
    const email = user.email || emp?.email || '';
    if (!email) return;
    setCreditsLoading(true);
    setCreditsError('');
    getLeaveCredits(email).then((res) => {
      if (res.success && res.credits) {
        setCredits(res.credits);
      } else {
        // Show zero credits with a soft warning — sheet may not be set up yet
        setCredits({ vacationLeave: 0, sickLeave: 0, birthdayLeave: 0 });
        setCreditsError(res.message);
      }
      setCreditsLoading(false);
    });
  }, [user.email, emp?.email]);

  // Auto-suggest paid/unpaid based on credits
  useEffect(() => {
    if (isEmergency) return;
    if (!credits) return;
    const needed = computeTotalDays();
    let available = 0;
    if (leaveType === 'Vacation Leave') available = credits.vacationLeave;
    else if (leaveType === 'Sick Leave') available = credits.sickLeave;
    else if (leaveType === 'Birthday Leave') available = credits.birthdayLeave;
    setPaymentStatus(available >= needed && needed > 0 ? 'Paid' : 'Unpaid');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leaveType, startDate, endDate, mode, credits]);

  // ── Duration computation ───────────────────────────────────────
  const computeTotalDays = useCallback((): number => {
    const dates = getDatesBetween(startDate, endDate);
    if (dates.length === 0) return 0;
    return mode === 'Full Day' ? dates.length : dates.length * 0.5;
  }, [startDate, endDate, mode]);

  const totalDays = computeTotalDays();

  const buildEntries = () => {
    const dates = getDatesBetween(startDate, endDate);
    return dates.map((d) => ({
      date: d,
      mode,
      halfDayPeriod: mode === 'Half Day' ? halfDayPeriod : undefined,
      days: mode === 'Full Day' ? 1 : 0.5,
    }));
  };

  const getDurationLabel = (): string => {
    const dates = getDatesBetween(startDate, endDate);
    const count = dates.length;
    if (count === 0) return '—';
    if (mode === 'Full Day') {
      return count === 1 ? '1 Full Day' : `${count} Full Days`;
    }
    const halfLabel = `Half Day (${halfDayPeriod})`;
    return count === 1 ? `1 × ${halfLabel}` : `${count} × ${halfLabel} = ${totalDays} Days`;
  };

  const getCreditForType = (): number | null => {
    if (!credits) return null;
    if (leaveType === 'Vacation Leave') return credits.vacationLeave;
    if (leaveType === 'Sick Leave') return credits.sickLeave;
    if (leaveType === 'Birthday Leave') return credits.birthdayLeave;
    return null;
  };

  const creditAvailable = getCreditForType();
  const creditInsufficient = !isEmergency && creditAvailable !== null && paymentStatus === 'Paid' && totalDays > creditAvailable;

  // ── Validation ─────────────────────────────────────────────────
  const validate = (): boolean => {
    const e: Record<string, string> = {};
    if (!startDate) e.startDate = 'Start date is required';
    if (!endDate) e.endDate = 'End date is required';
    if (startDate && endDate && endDate < startDate) e.endDate = 'End date must be after start date';
    if (mode === 'Half Day' && !halfDayPeriod) e.halfDayPeriod = 'Please select AM or PM';
    if (isBirthday && mode === 'Half Day') e.mode = 'Birthday Leave must be Full Day';
    if (!reason.trim()) e.reason = 'Reason is required';
    if (creditInsufficient) e.credits = `Insufficient credits. Available: ${creditAvailable}, Needed: ${totalDays}`;
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  // ── Submit ─────────────────────────────────────────────────────
  const handleSubmit = async () => {
    if (!validate()) return;
    setSubmitting(true);
    setResult(null);

    const res = await submitLeaveApplication(
      {
        employeeName: emp?.name || user.name || '',
        email: user.email || emp?.email || '',
        leaveType,
        startDate,
        endDate,
        mode,
        halfDayPeriod: mode === 'Half Day' ? halfDayPeriod : undefined,
        entries: buildEntries(),
        totalDays,
        paymentStatus: isEmergency ? 'Unpaid' : paymentStatus,
        reason: reason.trim(),
        status: 'Pending',
      },
      documentUrl || undefined
    );

    setSubmitting(false);
    setResult({ type: res.success ? 'success' : 'error', message: res.message });

    if (res.success) {
      setSubmittedDocUrl(res.docUrl || '');
      setStartDate('');
      setEndDate('');
      setReason('');
      setDocumentFile(null);
      setDocumentUrl('');
      setMode('Full Day');
      // Refresh credits
      const email = user.email || emp?.email || '';
      if (email) {
        const cr = await getLeaveCredits(email);
        if (cr.success && cr.credits) setCredits(cr.credits);
      }
    }
  };

  const today = new Date().toISOString().split('T')[0];

  return (
    <div className="min-h-dvh flex flex-col pb-24 bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900">
      {/* Header */}
      <div className="sticky top-0 z-30 bg-slate-900/90 backdrop-blur-xl border-b border-white/10">
        <div className="flex items-center gap-3 px-4 py-3 max-w-lg mx-auto">
          <button
            onClick={onBack}
            className="w-9 h-9 flex items-center justify-center rounded-xl bg-white/10 active:scale-90 transition-transform"
          >
            <ChevronLeft className="w-5 h-5 text-white" />
          </button>
          <div className="flex items-center gap-2">
            <FileText className="w-5 h-5 text-blue-400" />
            <h1 className="text-white font-bold text-base">Leave Application</h1>
          </div>
        </div>
      </div>

      <div className="flex-1 px-4 py-4 max-w-lg mx-auto w-full space-y-4">

        {/* Employee Info Card */}
        <div className="bg-white/5 backdrop-blur-xl rounded-2xl p-4 border border-white/10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-400 to-blue-700 flex items-center justify-center">
              <UserIcon className="w-5 h-5 text-white" />
            </div>
            <div>
              <p className="text-white font-semibold text-sm">{emp?.name || user.name}</p>
              <p className="text-blue-200/60 text-xs">{user.email || emp?.email}</p>
              {emp?.designation && (
                <p className="text-blue-200/40 text-[11px]">{emp.designation} — {emp.department}</p>
              )}
            </div>
          </div>
        </div>

        {/* Leave Credits */}
        <div className="bg-white/5 backdrop-blur-xl rounded-2xl p-4 border border-white/10">
          <div className="flex items-center gap-2 mb-3">
            <CreditCard className="w-4 h-4 text-blue-400" />
            <p className="text-white/80 text-sm font-semibold">Leave Credits</p>
          </div>
          {creditsLoading ? (
            <div className="flex items-center gap-2 text-blue-200/60 text-xs">
              <Loader2 className="w-3 h-3 animate-spin" />
              Loading credits…
            </div>
          ) : credits ? (
            <>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { label: 'Vacation', value: credits.vacationLeave, color: 'text-blue-400' },
                  { label: 'Sick', value: credits.sickLeave, color: 'text-red-400' },
                  { label: 'Birthday', value: credits.birthdayLeave, color: 'text-pink-400' },
                ].map(({ label, value, color }) => (
                  <div key={label} className="bg-white/5 rounded-xl p-2.5 text-center">
                    <p className={`text-lg font-bold ${color}`}>{value}</p>
                    <p className="text-white/40 text-[10px] mt-0.5">{label}</p>
                  </div>
                ))}
              </div>
              {creditsError && (
                <div className="flex items-center gap-2 mt-2 text-amber-400/70 text-[11px]">
                  <AlertCircle className="w-3 h-3 shrink-0" />
                  {creditsError}
                </div>
              )}
            </>
          ) : (
            <p className="text-white/30 text-xs">Credits not available</p>
          )}
        </div>

        {/* Leave Type */}
        <div className="space-y-2">
          <p className="text-white/60 text-xs font-semibold uppercase tracking-wider px-1">Leave Type</p>
          <div className="grid grid-cols-2 gap-2">
            {LEAVE_TYPES.map((type) => (
              <button
                key={type}
                onClick={() => setLeaveType(type)}
                className={`flex items-center gap-2 p-3 rounded-xl border transition-all active:scale-95 text-left ${
                  leaveType === type
                    ? `bg-gradient-to-r ${LEAVE_COLORS[type]} border-transparent text-white shadow-lg`
                    : 'bg-white/5 border-white/10 text-white/60 hover:bg-white/10'
                }`}
              >
                <span className="text-base">{LEAVE_ICONS[type]}</span>
                <span className="text-xs font-medium leading-tight">{type}</span>
              </button>
            ))}
          </div>
          {isEmergency && (
            <div className="flex items-start gap-2 bg-orange-500/10 border border-orange-500/20 rounded-xl px-3 py-2">
              <AlertCircle className="w-3.5 h-3.5 text-orange-400 mt-0.5 shrink-0" />
              <p className="text-orange-300/80 text-xs">Emergency Leave is always <strong>Unpaid</strong></p>
            </div>
          )}
          {isBirthday && (
            <div className="flex items-start gap-2 bg-pink-500/10 border border-pink-500/20 rounded-xl px-3 py-2">
              <Info className="w-3.5 h-3.5 text-pink-400 mt-0.5 shrink-0" />
              <p className="text-pink-300/80 text-xs">Birthday Leave must be a <strong>Full Day</strong></p>
            </div>
          )}
        </div>

        {/* Date Range */}
        <div className="space-y-2">
          <p className="text-white/60 text-xs font-semibold uppercase tracking-wider px-1">Date Range</p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-white/40 text-[11px] mb-1 block">Start Date</label>
              <div className="relative">
                <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-blue-400 pointer-events-none" />
                <input
                  type="date"
                  min={today}
                  value={startDate}
                  onChange={(e) => {
                    setStartDate(e.target.value);
                    if (!endDate || e.target.value > endDate) setEndDate(e.target.value);
                  }}
                  className="w-full bg-white/5 border border-white/10 rounded-xl pl-9 pr-3 py-2.5 text-white text-sm focus:outline-none focus:border-blue-400/60 [color-scheme:dark]"
                />
              </div>
              {errors.startDate && <p className="text-red-400 text-[11px] mt-1">{errors.startDate}</p>}
            </div>
            <div>
              <label className="text-white/40 text-[11px] mb-1 block">End Date</label>
              <div className="relative">
                <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-blue-400 pointer-events-none" />
                <input
                  type="date"
                  min={startDate || today}
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="w-full bg-white/5 border border-white/10 rounded-xl pl-9 pr-3 py-2.5 text-white text-sm focus:outline-none focus:border-blue-400/60 [color-scheme:dark]"
                />
              </div>
              {errors.endDate && <p className="text-red-400 text-[11px] mt-1">{errors.endDate}</p>}
            </div>
          </div>
        </div>

        {/* Leave Mode */}
        <div className="space-y-2">
          <p className="text-white/60 text-xs font-semibold uppercase tracking-wider px-1">Leave Mode</p>
          <div className="grid grid-cols-2 gap-2">
            {(['Full Day', 'Half Day'] as LeaveMode[]).map((m) => (
              <button
                key={m}
                onClick={() => !isBirthday && setMode(m)}
                disabled={isBirthday && m === 'Half Day'}
                className={`flex items-center justify-center gap-2 py-3 rounded-xl border transition-all active:scale-95 ${
                  mode === m
                    ? 'bg-blue-500/20 border-blue-400/40 text-blue-300'
                    : isBirthday && m === 'Half Day'
                    ? 'bg-white/3 border-white/5 text-white/20 cursor-not-allowed'
                    : 'bg-white/5 border-white/10 text-white/60 hover:bg-white/10'
                }`}
              >
                <Clock className="w-4 h-4" />
                <span className="text-sm font-medium">{m}</span>
              </button>
            ))}
          </div>
          {errors.mode && <p className="text-red-400 text-[11px]">{errors.mode}</p>}

          {/* AM / PM selector */}
          {mode === 'Half Day' && (
            <div className="grid grid-cols-2 gap-2 mt-1">
              {(['AM', 'PM'] as HalfDayPeriod[]).map((p) => (
                <button
                  key={p}
                  onClick={() => setHalfDayPeriod(p)}
                  className={`flex items-center justify-center gap-2 py-2.5 rounded-xl border transition-all active:scale-95 ${
                    halfDayPeriod === p
                      ? 'bg-amber-500/20 border-amber-400/40 text-amber-300'
                      : 'bg-white/5 border-white/10 text-white/60 hover:bg-white/10'
                  }`}
                >
                  {p === 'AM' ? <Sun className="w-4 h-4" /> : <Sunset className="w-4 h-4" />}
                  <span className="text-sm font-medium">{p === 'AM' ? 'Morning (AM)' : 'Afternoon (PM)'}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Payment Status */}
        {!isEmergency && (
          <div className="space-y-2">
            <p className="text-white/60 text-xs font-semibold uppercase tracking-wider px-1">Payment</p>
            <div className="grid grid-cols-2 gap-2">
              {(['Paid', 'Unpaid'] as PaymentStatus[]).map((ps) => (
                <button
                  key={ps}
                  onClick={() => setPaymentStatus(ps)}
                  className={`py-3 rounded-xl border transition-all active:scale-95 text-sm font-medium ${
                    paymentStatus === ps
                      ? ps === 'Paid'
                        ? 'bg-green-500/20 border-green-400/40 text-green-300'
                        : 'bg-slate-500/20 border-slate-400/40 text-slate-300'
                      : 'bg-white/5 border-white/10 text-white/60 hover:bg-white/10'
                  }`}
                >
                  {ps === 'Paid' ? '✅ Paid' : '⬜ Unpaid'}
                </button>
              ))}
            </div>
            {creditInsufficient && (
              <div className="flex items-start gap-2 bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2">
                <AlertCircle className="w-3.5 h-3.5 text-red-400 mt-0.5 shrink-0" />
                <p className="text-red-300/80 text-xs">
                  Insufficient credits ({creditAvailable} available, {totalDays} needed). Switch to Unpaid.
                </p>
              </div>
            )}
            {errors.credits && <p className="text-red-400 text-[11px]">{errors.credits}</p>}
          </div>
        )}

        {/* Reason */}
        <div className="space-y-2">
          <p className="text-white/60 text-xs font-semibold uppercase tracking-wider px-1">
            Reason <span className="text-red-400">*</span>
          </p>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            placeholder="State your reason for leave…"
            className={`w-full bg-white/5 border rounded-xl px-4 py-3 text-white text-sm placeholder-white/20 focus:outline-none resize-none ${
              errors.reason ? 'border-red-500/60 focus:border-red-400' : 'border-white/10 focus:border-blue-400/60'
            }`}
          />
          {errors.reason && (
            <p className="text-red-400 text-[11px] flex items-center gap-1">
              <AlertCircle className="w-3 h-3" />{errors.reason}
            </p>
          )}
        </div>

        {/* Document Attachment */}
        <div className="space-y-2">
          <p className="text-white/60 text-xs font-semibold uppercase tracking-wider px-1">
            Supporting Document <span className="text-white/30 normal-case font-normal">(optional)</span>
          </p>
          {documentFile ? (
            <div className="flex items-center gap-3 bg-white/5 border border-white/10 rounded-xl px-4 py-3">
              <Paperclip className="w-4 h-4 text-blue-400 shrink-0" />
              <span className="text-white/80 text-sm truncate flex-1">{documentFile.name}</span>
              <button
                onClick={() => { setDocumentFile(null); setDocumentUrl(''); }}
                className="text-white/30 hover:text-red-400 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <label className="flex items-center gap-3 bg-white/5 border border-dashed border-white/20 rounded-xl px-4 py-3 cursor-pointer hover:bg-white/10 transition-colors">
              <Paperclip className="w-4 h-4 text-blue-400/60" />
              <span className="text-white/40 text-sm">Tap to attach a file or image</span>
              <input
                type="file"
                accept="image/*,.pdf,.doc,.docx"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  setDocumentFile(file);
                  const reader = new FileReader();
                  reader.onload = () => setDocumentUrl(reader.result as string);
                  reader.readAsDataURL(file);
                }}
              />
            </label>
          )}
        </div>

        {/* Duration Summary */}
        {startDate && endDate && totalDays > 0 && (
          <div className="bg-blue-500/10 border border-blue-400/20 rounded-2xl p-4">
            <p className="text-blue-200/60 text-[11px] font-semibold uppercase tracking-wider mb-2">Leave Summary</p>
            <div className="space-y-1.5">
              <div className="flex justify-between text-sm">
                <span className="text-white/60">Leave Type</span>
                <span className="text-white font-medium">{LEAVE_ICONS[leaveType]} {leaveType}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-white/60">Duration</span>
                <span className="text-white font-medium">{getDurationLabel()}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-white/60">Payment</span>
                <span className={`font-bold ${isEmergency || paymentStatus === 'Unpaid' ? 'text-slate-300' : 'text-green-400'}`}>
                  {isEmergency ? 'Unpaid' : paymentStatus}
                </span>
              </div>
              <div className="border-t border-white/10 pt-1.5 flex justify-between">
                <span className="text-white/80 font-semibold text-sm">Total Leave Days</span>
                <span className="text-blue-300 font-bold text-lg">{totalDays.toFixed(1)}</span>
              </div>
            </div>
          </div>
        )}

        {/* Result */}
        {result && (
          <div className={`flex items-start gap-3 rounded-2xl p-4 border ${
            result.type === 'success'
              ? 'bg-green-500/10 border-green-400/20'
              : 'bg-red-500/10 border-red-400/20'
          }`}>
            {result.type === 'success'
              ? <CheckCircle2 className="w-5 h-5 text-green-400 shrink-0 mt-0.5" />
              : <AlertCircle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />}
            <div className="flex flex-col gap-1.5">
              <p className={`text-sm ${result.type === 'success' ? 'text-green-300' : 'text-red-300'}`}>
                {result.message}
              </p>
              {result.type === 'success' && submittedDocUrl && (
                <a
                  href={submittedDocUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-blue-300 text-xs underline underline-offset-2"
                >
                  <ExternalLink className="w-3 h-3" />
                  View attached document
                </a>
              )}
            </div>
          </div>
        )}

        {/* Submit */}
        <button
          onClick={handleSubmit}
          disabled={submitting || creditInsufficient}
          className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-blue-500 to-blue-700 text-white font-bold py-4 rounded-2xl active:scale-95 transition-transform disabled:opacity-50 disabled:cursor-not-allowed shadow-xl shadow-blue-900/40 text-sm"
        >
          {submitting ? (
            <><Loader2 className="w-4 h-4 animate-spin" /> Submitting…</>
          ) : (
            <><FileText className="w-4 h-4" /> Submit Leave Application</>
          )}
        </button>

      </div>
    </div>
  );
}
