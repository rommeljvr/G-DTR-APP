import { useState, useEffect } from 'react';
import {
  ArrowLeft, Plus, ChevronDown, ChevronUp, Clock, CheckCircle2,
  AlertCircle, Loader2, Send, Save, Trash2, Paperclip, X,
} from 'lucide-react';
import { User, OTRequest, OTType, OTStatus } from '../types';
import { getOTList, submitOT, updateOTDraft, cancelOT } from '../utils/sheets';

interface Props { user: User; onBack: () => void; }

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

const STATUS_STYLE: Record<OTStatus, string> = {
  'Draft':                 'bg-slate-500/15 text-slate-300 border-slate-400/20',
  'Submitted':             'bg-blue-500/15 text-blue-300 border-blue-400/20',
  'Pending Approval':      'bg-amber-500/15 text-amber-300 border-amber-400/20',
  'Returned for Revision': 'bg-orange-500/15 text-orange-300 border-orange-400/20',
  'Approved':              'bg-emerald-500/15 text-emerald-300 border-emerald-400/20',
  'Rejected':              'bg-red-500/15 text-red-300 border-red-400/20',
  'Cancelled':             'bg-white/5 text-white/30 border-white/10',
};

function fmt(iso: string) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return `${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()} ${d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}`;
}

function computeHours(start: string, end: string): number {
  if (!start || !end) return 0;
  const s = new Date(start), e = new Date(end);
  if (isNaN(s.getTime()) || isNaN(e.getTime())) return 0;
  return Math.max(0, Math.round((e.getTime() - s.getTime()) / 36000) / 100);
}

function fmtHours(h: number) {
  if (!h) return '—';
  const hrs = Math.floor(h), mins = Math.round((h - hrs) * 60);
  return mins > 0 ? `${hrs}h ${mins}m` : `${hrs}h`;
}

// ── Filing Form ──────────────────────────────────────────────────────────────
function OTForm({
  user, editRecord, onSaved, onClose,
}: {
  user: User;
  editRecord?: OTRequest;
  onSaved: () => void;
  onClose: () => void;
}) {
  const [otDate, setOtDate] = useState(editRecord?.otDate || '');
  const [otType, setOtType] = useState<OTType>(editRecord?.otType || 'Post-Shift');
  const [preStart, setPreStart] = useState(editRecord?.preShiftStart || '');
  const [preEnd, setPreEnd] = useState(editRecord?.preShiftEnd || '');
  const [postStart, setPostStart] = useState(editRecord?.postShiftStart || '');
  const [postEnd, setPostEnd] = useState(editRecord?.postShiftEnd || '');
  const [reason, setReason] = useState(editRecord?.reason || '');
  const [docFile, setDocFile] = useState<File | null>(null);
  const [docData, setDocData] = useState<string>('');
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0] ?? null;
    setDocFile(f);
    if (f) {
      const reader = new FileReader();
      reader.onload = () => setDocData(reader.result as string);
      reader.readAsDataURL(f);
    } else { setDocData(''); }
  };

  const showToast = (type: 'success' | 'error', msg: string) => {
    setToast({ type, msg });
    setTimeout(() => setToast(null), 3000);
  };

  const preHours  = otType === 'Pre-Shift'  ? computeHours(preStart, preEnd)   : 0;
  const postHours = otType === 'Post-Shift' ? computeHours(postStart, postEnd) : 0;
  const totalHours = preHours + postHours;

  const handleSubmit = async (isDraft: boolean) => {
    if (!otDate) { showToast('error', 'OT Date is required'); return; }
    if (!reason.trim()) { showToast('error', 'Reason / Justification is required'); return; }
    if (otType === 'Pre-Shift' && (!preStart || !preEnd))
      { showToast('error', 'Pre-Shift start and end time are required'); return; }
    if (otType === 'Post-Shift' && (!postStart || !postEnd))
      { showToast('error', 'Post-Shift start and end time are required'); return; }
    if (docFile && docFile.size > 5 * 1024 * 1024)
      { showToast('error', 'Document must be under 5MB'); return; }

    setSaving(true);
    let res;
    if (editRecord) {
      res = await updateOTDraft({
        otId: editRecord.id, email: user.email,
        submit: !isDraft, otDate, otType,
        preShiftStart: preStart, preShiftEnd: preEnd,
        postShiftStart: postStart, postShiftEnd: postEnd,
        reason, attachmentUrl: docData || undefined,
      });
    } else {
      res = await submitOT({
        employeeEmail: user.email, employeeName: user.name,
        department: user.employee?.department || '', designation: user.employee?.designation || '',
        otDate, otType,
        preShiftStart: preStart, preShiftEnd: preEnd,
        postShiftStart: postStart, postShiftEnd: postEnd,
        totalRequestedHours: totalHours, reason,
        attachmentUrl: docData || undefined,
        isDraft,
      } as Parameters<typeof submitOT>[0]);
    }
    setSaving(false);
    if (res.success) {
      showToast('success', isDraft ? 'Draft saved' : 'OT request submitted');
      setTimeout(onSaved, 900);
    } else {
      showToast('error', res.message);
    }
  };

  return (
    <div className="min-h-dvh bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 flex flex-col pb-24">
      {toast && (
        <div className={`fixed top-4 left-4 right-4 z-50 rounded-xl px-4 py-3 text-sm font-medium text-white shadow-2xl border flex items-center gap-2 ${
          toast.type === 'success' ? 'bg-emerald-600/90 border-emerald-400/30' : 'bg-red-600/90 border-red-400/30'
        }`}>
          {toast.type === 'success' ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
          {toast.msg}
        </div>
      )}

      <div className="bg-slate-900/80 backdrop-blur-xl border-b border-white/10 px-4 pt-12 pb-4 sticky top-0 z-30">
        <div className="flex items-center gap-3">
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-xl bg-white/10 active:scale-90 transition-transform">
            <ArrowLeft className="w-4 h-4 text-white" />
          </button>
          <div className="flex-1">
            <h1 className="text-white font-bold text-base">{editRecord ? 'Edit OT Request' : 'File Overtime'}</h1>
            <p className="text-white/40 text-xs">Complete all required fields</p>
          </div>
        </div>
      </div>

      <div className="flex-1 px-4 pt-4 space-y-4">

        {/* OT Date */}
        <div className="bg-white/5 border border-white/10 rounded-2xl p-4 space-y-2">
          <label className="text-white/50 text-xs font-medium">OT Date <span className="text-red-400">*</span></label>
          <input type="date" value={otDate} onChange={e => setOtDate(e.target.value)}
            className="w-full bg-slate-800 border border-white/10 text-white text-sm rounded-xl px-3 py-2.5 outline-none" />
        </div>

        {/* OT Type */}
        <div className="bg-white/5 border border-white/10 rounded-2xl p-4 space-y-2">
          <label className="text-white/50 text-xs font-medium">OT Type <span className="text-red-400">*</span></label>
          <div className="grid grid-cols-2 gap-2">
            {(['Pre-Shift', 'Post-Shift'] as OTType[]).map(t => (
              <button key={t} type="button" onClick={() => setOtType(t)}
                className={`py-2.5 rounded-xl text-xs font-medium border transition-colors ${
                  otType === t ? 'bg-blue-500/20 text-blue-300 border-blue-400/30' : 'bg-slate-800 text-white/50 border-white/10'
                }`}>{t}</button>
            ))}
          </div>
        </div>

        {/* Pre-Shift times */}
        {otType === 'Pre-Shift' && (
          <div className="bg-violet-500/5 border border-violet-400/15 rounded-2xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-violet-300 text-xs font-semibold uppercase tracking-wider">Pre-Shift OT</p>
              {preHours > 0 && <span className="text-violet-300 text-xs font-bold">{fmtHours(preHours)}</span>}
            </div>
            <div className="space-y-2">
              <div>
                <label className="text-white/40 text-[10px]">Start Date & Time <span className="text-red-400">*</span></label>
                <input type="datetime-local" value={preStart} onChange={e => setPreStart(e.target.value)}
                  className="w-full mt-1 bg-slate-800 border border-white/10 text-white text-xs rounded-xl px-3 py-2 outline-none" />
              </div>
              <div>
                <label className="text-white/40 text-[10px]">End Date & Time <span className="text-red-400">*</span></label>
                <input type="datetime-local" value={preEnd} onChange={e => setPreEnd(e.target.value)}
                  className="w-full mt-1 bg-slate-800 border border-white/10 text-white text-xs rounded-xl px-3 py-2 outline-none" />
              </div>
            </div>
          </div>
        )}

        {/* Post-Shift times */}
        {otType === 'Post-Shift' && (
          <div className="bg-amber-500/5 border border-amber-400/15 rounded-2xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-amber-300 text-xs font-semibold uppercase tracking-wider">Post-Shift OT</p>
              {postHours > 0 && <span className="text-amber-300 text-xs font-bold">{fmtHours(postHours)}</span>}
            </div>
            <div className="space-y-2">
              <div>
                <label className="text-white/40 text-[10px]">Start Date & Time <span className="text-red-400">*</span></label>
                <input type="datetime-local" value={postStart} onChange={e => setPostStart(e.target.value)}
                  className="w-full mt-1 bg-slate-800 border border-white/10 text-white text-xs rounded-xl px-3 py-2 outline-none" />
              </div>
              <div>
                <label className="text-white/40 text-[10px]">End Date & Time <span className="text-red-400">*</span></label>
                <input type="datetime-local" value={postEnd} onChange={e => setPostEnd(e.target.value)}
                  className="w-full mt-1 bg-slate-800 border border-white/10 text-white text-xs rounded-xl px-3 py-2 outline-none" />
              </div>
            </div>
          </div>
        )}

        {/* Total hours summary */}
        {totalHours > 0 && (
          <div className="bg-emerald-500/10 border border-emerald-400/20 rounded-2xl px-4 py-3 flex items-center justify-between">
            <span className="text-emerald-300 text-sm font-medium">Total Requested OT</span>
            <span className="text-emerald-300 text-lg font-bold">{fmtHours(totalHours)}</span>
          </div>
        )}

        {/* Reason */}
        <div className="bg-white/5 border border-white/10 rounded-2xl p-4 space-y-2">
          <label className="text-white/50 text-xs font-medium">Reason / Justification <span className="text-red-400">*</span></label>
          <textarea value={reason} onChange={e => setReason(e.target.value)} rows={3}
            placeholder="Describe the reason for overtime..."
            className="w-full bg-slate-800 border border-white/10 text-white text-sm rounded-xl px-3 py-2.5 outline-none placeholder-white/20 resize-none" />
        </div>

        {/* Supporting Document */}
        <div className="bg-white/5 border border-white/10 rounded-2xl p-4 space-y-2">
          <label className="text-white/50 text-xs font-medium">
            Supporting Document <span className="text-white/25 font-normal">(Optional)</span>
          </label>
          {docFile ? (
            <div className="flex items-center justify-between bg-white/8 border border-white/10 rounded-xl px-3 py-2.5">
              <div className="flex items-center gap-2 min-w-0">
                <Paperclip className="w-4 h-4 text-blue-300 shrink-0" />
                <span className="text-white/80 text-xs truncate">{docFile.name}</span>
                <span className="text-white/30 text-[10px] shrink-0">({(docFile.size / 1024 / 1024).toFixed(2)}MB)</span>
              </div>
              <button onClick={() => { setDocFile(null); setDocData(''); }} className="ml-2 text-white/30 hover:text-red-400 transition-colors shrink-0">
                <X className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <label className="flex items-center gap-3 bg-white/5 border border-dashed border-white/20 rounded-xl px-4 py-3 cursor-pointer hover:bg-white/8 transition-colors">
              <Paperclip className="w-4 h-4 text-blue-300/60" />
              <span className="text-white/40 text-sm">Attach PDF, JPG, JPEG, PNG (max 5MB)</span>
              <input type="file" accept=".pdf,.jpg,.jpeg,.png" className="hidden" onChange={handleFileChange} />
            </label>
          )}
        </div>

      </div>

      {/* Action buttons */}
      <div className="fixed bottom-0 left-0 right-0 bg-slate-900/95 backdrop-blur-xl border-t border-white/10 px-4 py-4 flex gap-3">
        <button onClick={() => handleSubmit(true)} disabled={saving}
          className="flex-1 flex items-center justify-center gap-2 py-3 rounded-2xl bg-white/10 text-white/70 text-sm font-semibold border border-white/10 disabled:opacity-50">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          Save Draft
        </button>
        <button onClick={() => handleSubmit(false)} disabled={saving}
          className="flex-[2] flex items-center justify-center gap-2 py-3 rounded-2xl bg-blue-600 text-white text-sm font-bold disabled:opacity-50">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          Submit OT Request
        </button>
      </div>
    </div>
  );
}

// ── OT Record Card (expandable) ──────────────────────────────────────────────
function OTCard({ record, userEmail, onRefresh }: { record: OTRequest; userEmail: string; onRefresh: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const [acting, setActing] = useState(false);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);

  const showToast = (type: 'success' | 'error', msg: string) => { setToast({ type, msg }); setTimeout(() => setToast(null), 3000); };

  const canEdit   = record.status === 'Draft' || record.status === 'Returned for Revision';
  const canCancel = record.status !== 'Approved' && record.status !== 'Cancelled';

  const handleCancel = async () => {
    setActing(true);
    const res = await cancelOT(record.id, userEmail);
    setActing(false);
    if (res.success) { showToast('success', 'OT request cancelled'); onRefresh(); }
    else showToast('error', res.message);
  };

  return (
    <div className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden">
      {toast && (
        <div className={`mx-3 mt-3 rounded-xl px-3 py-2 text-xs font-medium text-white flex items-center gap-2 ${
          toast.type === 'success' ? 'bg-emerald-600/80' : 'bg-red-600/80'
        }`}>
          {toast.type === 'success' ? <CheckCircle2 className="w-3.5 h-3.5 shrink-0" /> : <AlertCircle className="w-3.5 h-3.5 shrink-0" />}
          {toast.msg}
        </div>
      )}

      <button className="w-full flex items-center gap-3 px-4 py-3 active:bg-white/5" onClick={() => setExpanded(v => !v)}>
        <div className="w-10 h-10 rounded-xl bg-blue-500/15 flex items-center justify-center shrink-0">
          <Clock className="w-5 h-5 text-blue-300" />
        </div>
        <div className="flex-1 text-left min-w-0">
          <p className="text-white text-sm font-medium">{record.otDate}</p>
          <p className="text-white/40 text-[10px]">{record.otType} • {record.totalRequestedHours > 0 ? fmtHours(record.totalRequestedHours) : '—'}</p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <span className={`text-[9px] font-semibold px-2 py-0.5 rounded-full border ${STATUS_STYLE[record.status]}`}>{record.status}</span>
          {expanded ? <ChevronUp className="w-3.5 h-3.5 text-white/30" /> : <ChevronDown className="w-3.5 h-3.5 text-white/30" />}
        </div>
      </button>

      {expanded && (
        <div className="px-4 pb-4 space-y-3 border-t border-white/5 pt-3">
          {/* Details */}
          <div className="grid grid-cols-2 gap-2 text-[10px]">
            {record.otType === 'Pre-Shift' && (<>
              <div className="col-span-2 text-violet-300/70 font-semibold uppercase tracking-wider text-[9px]">Pre-Shift</div>
              <div><span className="text-white/30">Start: </span><span className="text-white/70">{fmt(record.preShiftStart || '')}</span></div>
              <div><span className="text-white/30">End: </span><span className="text-white/70">{fmt(record.preShiftEnd || '')}</span></div>
            </>)}
            {record.otType === 'Post-Shift' && (<>
              <div className="col-span-2 text-amber-300/70 font-semibold uppercase tracking-wider text-[9px] mt-1">Post-Shift</div>
              <div><span className="text-white/30">Start: </span><span className="text-white/70">{fmt(record.postShiftStart || '')}</span></div>
              <div><span className="text-white/30">End: </span><span className="text-white/70">{fmt(record.postShiftEnd || '')}</span></div>
            </>)}
            <div><span className="text-white/30">Total: </span><span className="text-white font-semibold">{fmtHours(record.totalRequestedHours)}</span></div>
            {record.approvedHours != null && (
              <div><span className="text-white/30">Approved: </span><span className="text-emerald-300 font-semibold">{fmtHours(record.approvedHours)}</span></div>
            )}
          </div>

          {record.reason && (
            <div className="bg-white/3 rounded-xl px-3 py-2 text-[10px]">
              <p className="text-white/30 text-[9px] mb-0.5">Reason</p>
              <p className="text-white/70">{record.reason}</p>
            </div>
          )}

          {record.attachmentUrl && (
            <a href={record.attachmentUrl} target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-2 bg-blue-500/8 border border-blue-400/15 rounded-xl px-3 py-2 text-[10px] text-blue-300 hover:bg-blue-500/15 transition-colors">
              <Paperclip className="w-3 h-3 shrink-0" />
              View Supporting Document
            </a>
          )}

          {record.returnRemarks && (
            <div className="bg-orange-500/5 border border-orange-400/15 rounded-xl px-3 py-2 text-[10px]">
              <p className="text-orange-300/60 text-[9px] mb-0.5">Return Remarks</p>
              <p className="text-orange-300/90">{record.returnRemarks}</p>
            </div>
          )}
          {record.rejectionReason && (
            <div className="bg-red-500/5 border border-red-400/15 rounded-xl px-3 py-2 text-[10px]">
              <p className="text-red-300/60 text-[9px] mb-0.5">Rejection Reason</p>
              <p className="text-red-300/90">{record.rejectionReason}</p>
            </div>
          )}

          {/* Audit trail */}
          {record.auditTrail?.length > 0 && (
            <div className="space-y-1.5 pt-1">
              <p className="text-white/30 text-[9px] font-semibold uppercase tracking-wider">History</p>
              {record.auditTrail.map((entry, i) => (
                <div key={i} className="flex items-start gap-2">
                  <div className="w-1.5 h-1.5 rounded-full mt-1.5 shrink-0 bg-blue-400" />
                  <div className="text-[9px]">
                    <span className="text-white/60 font-medium">{entry.action}</span>
                    <span className="text-white/30"> by {entry.by}</span>
                    {entry.remarks && <p className="text-white/30 italic">"{entry.remarks}"</p>}
                    <p className="text-white/20">{fmt(entry.at)}</p>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Actions */}
          {(canEdit || canCancel) && (
            <div className="flex gap-2 pt-1">
              {canCancel && (
                <button onClick={handleCancel} disabled={acting}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-red-500/10 text-red-300 border border-red-400/20 text-[10px] font-semibold disabled:opacity-50">
                  {acting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
                  Cancel
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function OTFiling({ user, onBack }: Props) {
  const [records, setRecords] = useState<OTRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editRecord, setEditRecord] = useState<OTRequest | undefined>();
  const [toast, setToast] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);

  const showToast = (type: 'success' | 'error', msg: string) => { setToast({ type, msg }); setTimeout(() => setToast(null), 3000); };

  const load = async () => {
    setLoading(true);
    const res = await getOTList(user.email);
    setRecords(res.records || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const handleSaved = () => { setShowForm(false); setEditRecord(undefined); showToast('success', 'OT request saved'); load(); };

  if (showForm || editRecord) {
    return <OTForm user={user} editRecord={editRecord} onSaved={handleSaved} onClose={() => { setShowForm(false); setEditRecord(undefined); }} />;
  }

  const myRecords = records.filter(r => r.employeeEmail.toLowerCase() === user.email.toLowerCase());

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
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="w-8 h-8 flex items-center justify-center rounded-xl bg-white/10 active:scale-90 transition-transform">
            <ArrowLeft className="w-4 h-4 text-white" />
          </button>
          <div className="flex-1">
            <h1 className="text-white font-bold text-base">My OT Requests</h1>
            <p className="text-white/40 text-xs">File and track overtime requests</p>
          </div>
          <button onClick={() => setShowForm(true)} className="flex items-center gap-1.5 bg-blue-600 text-white text-xs font-bold px-3 py-2 rounded-xl active:scale-95">
            <Plus className="w-3.5 h-3.5" /> File OT
          </button>
        </div>
      </div>

      <div className="flex-1 px-4 pt-4 space-y-3">
        {loading ? (
          Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="bg-white/5 border border-white/8 rounded-2xl h-16 animate-pulse" />
          ))
        ) : myRecords.length === 0 ? (
          <div className="flex flex-col items-center py-16 gap-3">
            <Clock className="w-12 h-12 text-white/10" />
            <p className="text-white/40 text-sm">No OT requests yet</p>
            <button onClick={() => setShowForm(true)} className="flex items-center gap-1.5 bg-blue-600/20 text-blue-300 border border-blue-400/20 text-xs font-semibold px-4 py-2 rounded-xl">
              <Plus className="w-3.5 h-3.5" /> File your first OT request
            </button>
          </div>
        ) : (
          myRecords.map(r => (
            <OTCard key={r.id} record={r} userEmail={user.email} onRefresh={load} />
          ))
        )}
      </div>
    </div>
  );
}
