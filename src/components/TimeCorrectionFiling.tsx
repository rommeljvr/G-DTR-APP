import { useState, useEffect } from 'react';
import {
  ChevronLeft, Clock, Calendar, FileText, Paperclip,
  AlertCircle, CheckCircle2, Loader2, X, Info,
} from 'lucide-react';
import { User, AttendanceRecord, TimeCorrectionFiling as TCFiling } from '../types';
import { getAttendanceHistory, submitTimeCorrection, getTimeCorrectionHistory, getApproverSettings } from '../utils/sheets';

interface Props {
  user: User;
  onBack: () => void;
  onViewReports?: () => void;
}

const MAX_FILE_SIZE_MB = 5;
const MIN_REASON_LEN   = 10;

const STATUS_STYLE: Record<string, string> = {
  Pending:   'bg-amber-400/15 text-amber-300 border border-amber-400/30',
  Approved:  'bg-emerald-400/15 text-emerald-300 border border-emerald-400/30',
  Rejected:  'bg-red-400/15 text-red-300 border border-red-400/30',
  Cancelled: 'bg-slate-400/15 text-slate-300 border border-slate-400/30',
};

function to24(t12: string): string {
  if (!t12) return '';
  const m = t12.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)$/i);
  if (!m) return t12;
  let h = parseInt(m[1], 10);
  const min = m[2];
  const ampm = m[4].toUpperCase();
  if (ampm === 'AM' && h === 12) h = 0;
  if (ampm === 'PM' && h !== 12) h += 12;
  return `${String(h).padStart(2, '0')}:${min}`;
}

function to12(t24: string): string {
  if (!t24) return '';
  const [hStr, mStr] = t24.split(':');
  let h = parseInt(hStr, 10);
  const ampm = h >= 12 ? 'PM' : 'AM';
  if (h > 12) h -= 12;
  if (h === 0) h = 12;
  return `${String(h).padStart(2, '0')}:${mStr} ${ampm}`;
}

function formatDate(val: string): string {
  if (!val) return '';
  const d = new Date(val.replace(/-/g, '/'));
  return isNaN(d.getTime()) ? val : d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

function isWithin30Days(dateStr: string): boolean {
  const d    = new Date(dateStr);
  const now  = new Date();
  const diff = Math.floor((now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24));
  return diff >= 0 && diff <= 30;
}

export default function TimeCorrectionFiling({ user, onBack, onViewReports }: Props) {
  const emp = user.employee;

  const [step, setStep] = useState<'select' | 'form'>('select');
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [filings, setFilings] = useState<TCFiling[]>([]);
  const [loadingRecords, setLoadingRecords] = useState(true);
  const [selectedRecord, setSelectedRecord] = useState<AttendanceRecord | null>(null);
  const [approverEmail, setApproverEmail] = useState('');

  const [correctedTimeIn, setCorrectedTimeIn]   = useState('');
  const [correctedTimeOut, setCorrectedTimeOut] = useState('');
  const [reason, setReason]                     = useState('');
  const [documentFile, setDocumentFile]         = useState<File | null>(null);

  const [submitting, setSubmitting]   = useState(false);
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [errors, setErrors]           = useState<Record<string, string>>({});

  useEffect(() => {
    const load = async () => {
      setLoadingRecords(true);
      const [attRes, tcRes, approverRes] = await Promise.all([
        getAttendanceHistory(user.email),
        getTimeCorrectionHistory(user.email),
        getApproverSettings(user.email),
      ]);
      // Deduplicate: group by date, pick last TIME_IN + TIME_OUT per day
      const byDate: Record<string, AttendanceRecord[]> = {};
      for (const r of attRes) {
        if (!byDate[r.date]) byDate[r.date] = [];
        byDate[r.date].push(r);
      }
      // Keep only records within 30 days
      const eligible = attRes.filter(r => isWithin30Days(r.date));
      setRecords(eligible);
      setFilings(tcRes.records || []);
      if (approverRes?.approverEmail) setApproverEmail(approverRes.approverEmail);
      setLoadingRecords(false);
    };
    load();
  }, [user.email]);

  const notify = (type: 'success' | 'error', message: string) => {
    setNotification({ type, message });
    setTimeout(() => setNotification(null), 4000);
  };

  const getActiveFilingForRecord = (recordId: string) =>
    filings.find(f => f.attendanceRecordId === recordId && (f.status === 'Pending' || f.status === 'Approved'));

  const validate = (): boolean => {
    const e: Record<string, string> = {};
    if (!selectedRecord) return false;
    const isIn = selectedRecord.action === 'TIME_IN';
    if (isIn && !correctedTimeIn)
      e.correctedTimeIn = 'Corrected Time In is required';
    if (!isIn && !correctedTimeOut)
      e.correctedTimeOut = 'Corrected Time Out is required';
    if (isIn && correctedTimeIn) {
      if (to24(correctedTimeIn) === to24(selectedRecord.time))
        e.correctedTimeIn = 'Corrected Time In must differ from original';
    }
    if (!isIn && correctedTimeOut) {
      if (to24(correctedTimeOut) === to24(selectedRecord.time))
        e.correctedTimeOut = 'Corrected Time Out must differ from original';
    }
    if (!reason.trim() || reason.trim().length < MIN_REASON_LEN)
      e.reason = `Reason must be at least ${MIN_REASON_LEN} characters`;
    if (documentFile) {
      const mb = documentFile.size / (1024 * 1024);
      if (mb > MAX_FILE_SIZE_MB) e.doc = `File must be under ${MAX_FILE_SIZE_MB}MB`;
      const ext = documentFile.name.split('.').pop()?.toLowerCase() || '';
      if (!['pdf', 'jpg', 'jpeg', 'png'].includes(ext)) e.doc = 'Only PDF, JPG, JPEG, PNG allowed';
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSelectRecord = (rec: AttendanceRecord) => {
    setSelectedRecord(rec);
    setCorrectedTimeIn('');
    setCorrectedTimeOut('');
    setReason('');
    setDocumentFile(null);
    setErrors({});
    setStep('form');
  };

  const handleFileChange = (e: { target: HTMLInputElement }) => {
    const f = (e.target.files?.[0]) ?? null;
    setDocumentFile(f);
  };

  const handleSubmit = async () => {
    if (!selectedRecord) return;
    if (!validate()) return;

    setSubmitting(true);
    let documentData: string | undefined;
    if (documentFile) {
      documentData = await new Promise<string>((res) => {
        const reader = new FileReader();
        reader.onload = (ev) => res(ev.target?.result as string);
        reader.readAsDataURL(documentFile);
      });
    }

    const result = await submitTimeCorrection({
      employeeName:       user.name,
      email:              user.email,
      department:         emp?.department || '',
      designation:        emp?.designation || '',
      attendanceDate:     selectedRecord.date,
      attendanceRecordId: selectedRecord.id,
      originalTimeIn:     selectedRecord.action === 'TIME_IN'  ? selectedRecord.time : '',
      originalTimeOut:    selectedRecord.action === 'TIME_OUT' ? selectedRecord.time : '',
      correctedTimeIn:    correctedTimeIn  ? to12(correctedTimeIn)  : '',
      correctedTimeOut:   correctedTimeOut ? to12(correctedTimeOut) : '',
      reason:             reason.trim(),
      approverEmail,
    }, documentData);

    setSubmitting(false);
    if (result.success) {
      notify('success', 'Time Correction filed successfully!');
      setStep('select');
      setSelectedRecord(null);
      // Refresh filings
      const tcRes = await getTimeCorrectionHistory(user.email);
      setFilings(tcRes.records || []);
    } else {
      notify('error', result.message || 'Submission failed');
    }
  };

  // Group records by date for display
  const recordsByDate: Record<string, AttendanceRecord[]> = {};
  for (const r of records) {
    if (!recordsByDate[r.date]) recordsByDate[r.date] = [];
    recordsByDate[r.date].push(r);
  }
  const sortedDates = Object.keys(recordsByDate).sort((a, b) => new Date(b).getTime() - new Date(a).getTime());

  return (
    <div className="min-h-dvh bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 flex flex-col">
      {/* Notification */}
      {notification && (
        <div className={`fixed top-4 left-1/2 -translate-x-1/2 z-50 px-5 py-3 rounded-xl shadow-xl flex items-center gap-2 text-sm font-medium
          ${notification.type === 'success' ? 'bg-emerald-500/90 text-white' : 'bg-red-500/90 text-white'}`}>
          {notification.type === 'success' ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
          {notification.message}
        </div>
      )}

      {/* Header */}
      <div className="bg-white/5 backdrop-blur-xl border-b border-white/10 px-4 py-4 flex items-center gap-3">
        <button onClick={step === 'form' ? () => setStep('select') : onBack}
          className="w-9 h-9 rounded-full bg-white/10 flex items-center justify-center hover:bg-white/20 transition-colors">
          <ChevronLeft className="w-5 h-5 text-white" />
        </button>
        <div className="flex-1">
          <h1 className="text-white font-bold text-lg">Time Correction Filing</h1>
          <p className="text-blue-200/60 text-xs">
            {step === 'select' ? 'Select an attendance record' : 'Fill in correction details'}
          </p>
        </div>
        {onViewReports && step === 'select' && (
          <button onClick={onViewReports}
            className="text-xs text-blue-300 border border-blue-400/30 px-3 py-1.5 rounded-lg hover:bg-blue-400/10 transition-colors">
            My Filings
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-5 space-y-4 pb-8">

        {/* ── STEP 1: Select attendance record ── */}
        {step === 'select' && (
          <>
            <div className="bg-blue-500/10 border border-blue-400/20 rounded-xl p-3 flex gap-2 text-blue-200/80 text-xs">
              <Info className="w-4 h-4 shrink-0 mt-0.5" />
              <span>Only attendance records within the last <strong>30 days</strong> are eligible for correction. Records with an active or approved request cannot be refiled.</span>
            </div>

            {loadingRecords ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="w-8 h-8 text-blue-400 animate-spin" />
              </div>
            ) : sortedDates.length === 0 ? (
              <div className="text-center py-16 text-blue-200/40 text-sm">No eligible attendance records found</div>
            ) : (
              sortedDates.map(date => (
                <div key={date}>
                  <p className="text-blue-300/60 text-xs font-semibold uppercase tracking-wider mb-2 px-1">
                    {formatDate(date)}
                  </p>
                  <div className="space-y-2">
                    {recordsByDate[date].map(rec => {
                      const activeFiling = getActiveFilingForRecord(rec.id);
                      const blocked = !!activeFiling;
                      return (
                        <button
                          key={rec.id}
                          onClick={() => !blocked && handleSelectRecord(rec)}
                          disabled={blocked}
                          className={`w-full text-left rounded-xl p-4 border transition-all
                            ${blocked
                              ? 'bg-white/3 border-white/5 opacity-50 cursor-not-allowed'
                              : 'bg-white/5 border-white/10 hover:bg-white/10 hover:border-blue-400/30 active:scale-98'}`}
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              <div className={`w-9 h-9 rounded-full flex items-center justify-center text-lg
                                ${rec.action === 'TIME_IN' ? 'bg-emerald-500/20' : 'bg-red-500/20'}`}>
                                {rec.action === 'TIME_IN' ? '▶' : '◼'}
                              </div>
                              <div>
                                <p className={`text-sm font-semibold ${rec.action === 'TIME_IN' ? 'text-emerald-300' : 'text-red-300'}`}>
                                  {rec.action === 'TIME_IN' ? 'Time In' : 'Time Out'}
                                </p>
                                <p className="text-white/70 text-xs flex items-center gap-1">
                                  <Clock className="w-3 h-3" /> {rec.time}
                                </p>
                              </div>
                            </div>
                            {blocked && activeFiling && (
                              <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_STYLE[activeFiling.status]}`}>
                                {activeFiling.status}
                              </span>
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))
            )}
          </>
        )}

        {/* ── STEP 2: Fill correction form ── */}
        {step === 'form' && selectedRecord && (
          <>
            {/* Original record summary */}
            <div className="bg-white/5 border border-white/10 rounded-xl p-4 space-y-3">
              <p className="text-blue-200/60 text-xs font-semibold uppercase tracking-wider">Original Record</p>
              <div className="flex items-start gap-3">
                {(selectedRecord.imageUrl || selectedRecord.photo) && (
                  <img
                    src={selectedRecord.imageUrl || selectedRecord.photo}
                    alt="Attendance photo"
                    className="w-16 h-16 rounded-lg object-cover border border-white/10 shrink-0"
                    onError={(e: { target: EventTarget | null }) => { if (e.target) (e.target as HTMLImageElement).style.display = 'none'; }}
                  />
                )}
                <div className="space-y-2 flex-1">
                  <div className="flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-blue-300 shrink-0" />
                    <span className="text-white text-sm">{formatDate(selectedRecord.date)}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Clock className="w-4 h-4 text-blue-300 shrink-0" />
                    <span className={`text-sm font-medium ${selectedRecord.action === 'TIME_IN' ? 'text-emerald-300' : 'text-red-300'}`}>
                      {selectedRecord.action === 'TIME_IN' ? 'Time In' : 'Time Out'}: {selectedRecord.time}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Corrected time — only the field matching the record's action */}
            <div className="bg-white/5 border border-white/10 rounded-xl p-4 space-y-3">
              <p className="text-blue-200/60 text-xs font-semibold uppercase tracking-wider">Corrected Time</p>
              {selectedRecord.action === 'TIME_IN' ? (
                <div>
                  <label className="text-white/70 text-xs mb-1 block">Corrected Time In <span className="text-red-400">*</span></label>
                  <input
                    type="time"
                    value={correctedTimeIn}
                    onChange={(e: { target: HTMLInputElement }) => setCorrectedTimeIn(e.target.value)}
                    className="w-full bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-emerald-400/50"
                  />
                  {errors.correctedTimeIn && <p className="text-red-400 text-xs mt-1">{errors.correctedTimeIn}</p>}
                </div>
              ) : (
                <div>
                  <label className="text-white/70 text-xs mb-1 block">Corrected Time Out <span className="text-red-400">*</span></label>
                  <input
                    type="time"
                    value={correctedTimeOut}
                    onChange={(e: { target: HTMLInputElement }) => setCorrectedTimeOut(e.target.value)}
                    className="w-full bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-red-400/50"
                  />
                  {errors.correctedTimeOut && <p className="text-red-400 text-xs mt-1">{errors.correctedTimeOut}</p>}
                </div>
              )}
            </div>

            {/* Reason */}
            <div className="bg-white/5 border border-white/10 rounded-xl p-4">
              <label className="text-blue-200/60 text-xs font-semibold uppercase tracking-wider block mb-2">
                Reason for Correction <span className="text-red-400">*</span>
              </label>
              <textarea
                rows={4}
                value={reason}
                onChange={(e: { target: HTMLTextAreaElement }) => setReason(e.target.value)}
                placeholder="Explain why the time correction is needed (min 10 characters)..."
                className="w-full bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-white text-sm placeholder-white/30 focus:outline-none focus:border-blue-400/50 resize-none"
              />
              <div className="flex justify-between mt-1">
                {errors.reason
                  ? <p className="text-red-400 text-xs">{errors.reason}</p>
                  : <span />}
                <p className="text-white/30 text-xs">{reason.length} chars</p>
              </div>
            </div>

            {/* Attachment */}
            <div className="bg-white/5 border border-white/10 rounded-xl p-4">
              <label className="text-blue-200/60 text-xs font-semibold uppercase tracking-wider block mb-2">
                Supporting Document <span className="text-white/30">(Optional)</span>
              </label>
              {documentFile ? (
                <div className="flex items-center justify-between bg-white/10 rounded-lg px-3 py-2">
                  <div className="flex items-center gap-2">
                    <Paperclip className="w-4 h-4 text-blue-300" />
                    <span className="text-white/80 text-xs truncate max-w-[200px]">{documentFile.name}</span>
                    <span className="text-white/40 text-xs">({(documentFile.size / 1024 / 1024).toFixed(2)}MB)</span>
                  </div>
                  <button onClick={() => setDocumentFile(null)} className="text-red-400 hover:text-red-300">
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <label className="flex items-center gap-2 cursor-pointer bg-white/10 border border-dashed border-white/20 rounded-lg px-4 py-3 hover:bg-white/15 transition-colors">
                  <Paperclip className="w-4 h-4 text-blue-300" />
                  <span className="text-white/60 text-sm">Attach PDF, JPG, JPEG, PNG (max {MAX_FILE_SIZE_MB}MB)</span>
                  <input type="file" accept=".pdf,.jpg,.jpeg,.png" className="hidden" onChange={handleFileChange} />
                </label>
              )}
              {errors.doc && <p className="text-red-400 text-xs mt-1">{errors.doc}</p>}
            </div>

            {/* Submit */}
            <button
              onClick={handleSubmit}
              disabled={submitting}
              className="w-full py-4 rounded-xl font-bold text-white bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2 shadow-lg">
              {submitting ? <><Loader2 className="w-5 h-5 animate-spin" /> Submitting…</> : <><FileText className="w-5 h-5" /> Submit Time Correction</>}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
