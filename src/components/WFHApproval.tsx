import { useState, useEffect, useCallback } from 'react';
import {
  ArrowLeft, Loader2, CheckCircle2, AlertCircle, Home,
  ThumbsUp, ThumbsDown, RotateCcw, ExternalLink, Paperclip,
  ChevronDown, ChevronUp, Search, X,
} from 'lucide-react';
import { User, WFHRecord } from '../types';
import { getPendingWFHApprovals, approveWFH, rejectWFH, requestWFHRevision } from '../utils/sheets';

interface Props {
  user: User;
  onBack: () => void;
}

const STATUS_STYLE: Record<string, string> = {
  Submitted:        'bg-blue-400/15 text-blue-300 border border-blue-400/30',
  'Pending Review': 'bg-amber-400/15 text-amber-300 border border-amber-400/30',
  Resubmitted:      'bg-violet-400/15 text-violet-300 border border-violet-400/30',
  Approved:         'bg-emerald-400/15 text-emerald-300 border border-emerald-400/30',
  Rejected:         'bg-red-400/15 text-red-300 border border-red-400/30',
  'Revision Required': 'bg-orange-400/15 text-orange-300 border border-orange-400/30',
};

function fmtDate(val: string) {
  if (!val) return '';
  try { return new Date(val).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'Asia/Manila' }); }
  catch { return val; }
}
function fmtDateTime(val: string) {
  if (!val) return '';
  try { return new Date(val).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'Asia/Manila' }); }
  catch { return val; }
}

export default function WFHApproval({ user, onBack }: Props) {
  const [records, setRecords]           = useState<WFHRecord[]>([]);
  const [loading, setLoading]           = useState(true);
  const [search, setSearch]             = useState('');
  const [expanded, setExpanded]         = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const [rejectModal, setRejectModal]   = useState(false);
  const [revisionModal, setRevisionModal] = useState(false);
  const [activeRec, setActiveRec]       = useState<WFHRecord | null>(null);
  const [inputText, setInputText]       = useState('');
  const [approveModal, setApproveModal] = useState(false);
  const [approveComment, setApproveComment] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    const res = await getPendingWFHApprovals(user.email);
    setRecords(res.records || []);
    setLoading(false);
  }, [user.email]);

  useEffect(() => { load(); }, [load]);

  const notify = (type: 'success' | 'error', message: string) => {
    setNotification({ type, message });
    setTimeout(() => setNotification(null), 4000);
  };

  const handleApprove = async () => {
    if (!activeRec) return;
    setActionLoading(true);
    const res = await approveWFH(activeRec.id, user.email, approveComment.trim() || undefined);
    setActionLoading(false);
    if (res.success) { notify('success', 'WFH approved.'); setApproveModal(false); setActiveRec(null); load(); }
    else notify('error', res.message || 'Approval failed');
  };

  const handleReject = async () => {
    if (!activeRec || !inputText.trim()) { notify('error', 'Rejection reason is required.'); return; }
    setActionLoading(true);
    const res = await rejectWFH(activeRec.id, user.email, inputText.trim());
    setActionLoading(false);
    if (res.success) { notify('success', 'WFH rejected.'); setRejectModal(false); setActiveRec(null); setInputText(''); load(); }
    else notify('error', res.message || 'Rejection failed');
  };

  const handleRevision = async () => {
    if (!activeRec || !inputText.trim()) { notify('error', 'Please provide revision comments.'); return; }
    setActionLoading(true);
    const res = await requestWFHRevision(activeRec.id, user.email, inputText.trim());
    setActionLoading(false);
    if (res.success) { notify('success', 'Revision requested.'); setRevisionModal(false); setActiveRec(null); setInputText(''); load(); }
    else notify('error', res.message || 'Request failed');
  };

  const filtered = records.filter(r => {
    const q = search.toLowerCase();
    return !q || r.employeeName.toLowerCase().includes(q) || r.attendanceDate.includes(q) || r.workDescription.toLowerCase().includes(q);
  });

  return (
    <div className="min-h-dvh bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 flex flex-col pb-20">
      {notification && (
        <div className={`fixed top-4 left-1/2 -translate-x-1/2 z-50 px-5 py-3 rounded-xl shadow-xl flex items-center gap-2 text-sm font-medium w-[90vw] max-w-sm
          ${notification.type === 'success' ? 'bg-emerald-500/90 text-white' : 'bg-red-500/90 text-white'}`}>
          {notification.type === 'success' ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
          {notification.message}
        </div>
      )}

      {/* Reject modal */}
      {rejectModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-40 flex items-end sm:items-center justify-center px-4 pb-4">
          <div className="bg-slate-900/95 border border-white/10 rounded-2xl p-6 w-full max-w-sm">
            <h3 className="text-white font-bold text-lg mb-1">Reject WFH</h3>
            <p className="text-white/50 text-xs mb-4">Provide a reason for rejection</p>
            <textarea value={inputText} onChange={e => setInputText(e.target.value)} rows={3}
              placeholder="Rejection reason…" className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-white text-sm placeholder-white/25 focus:outline-none resize-none mb-4" />
            <div className="flex gap-2">
              <button onClick={() => { setRejectModal(false); setInputText(''); }} className="flex-1 bg-white/8 text-white/60 rounded-xl py-2.5 text-sm">Cancel</button>
              <button onClick={handleReject} disabled={actionLoading} className="flex-1 bg-red-600 text-white rounded-xl py-2.5 text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-60">
                {actionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ThumbsDown className="w-4 h-4" />} Reject
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Revision modal */}
      {revisionModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-40 flex items-end sm:items-center justify-center px-4 pb-4">
          <div className="bg-slate-900/95 border border-white/10 rounded-2xl p-6 w-full max-w-sm">
            <h3 className="text-white font-bold text-lg mb-1">Request Revision</h3>
            <p className="text-white/50 text-xs mb-4">Describe what needs to be revised</p>
            <textarea value={inputText} onChange={e => setInputText(e.target.value)} rows={3}
              placeholder="Revision comments…" className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-white text-sm placeholder-white/25 focus:outline-none resize-none mb-4" />
            <div className="flex gap-2">
              <button onClick={() => { setRevisionModal(false); setInputText(''); }} className="flex-1 bg-white/8 text-white/60 rounded-xl py-2.5 text-sm">Cancel</button>
              <button onClick={handleRevision} disabled={actionLoading} className="flex-1 bg-orange-600 text-white rounded-xl py-2.5 text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-60">
                {actionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RotateCcw className="w-4 h-4" />} Request
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Approve modal */}
      {approveModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-40 flex items-end sm:items-center justify-center px-4 pb-4">
          <div className="bg-slate-900/95 border border-white/10 rounded-2xl p-6 w-full max-w-sm">
            <h3 className="text-white font-bold text-lg mb-1">Approve WFH</h3>
            <p className="text-white/50 text-xs mb-4">Optional comments for the employee</p>
            <textarea value={approveComment} onChange={e => setApproveComment(e.target.value)} rows={2}
              placeholder="Comments (optional)…" className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-white text-sm placeholder-white/25 focus:outline-none resize-none mb-4" />
            <div className="flex gap-2">
              <button onClick={() => { setApproveModal(false); setApproveComment(''); }} className="flex-1 bg-white/8 text-white/60 rounded-xl py-2.5 text-sm">Cancel</button>
              <button onClick={handleApprove} disabled={actionLoading} className="flex-1 bg-emerald-600 text-white rounded-xl py-2.5 text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-60">
                {actionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ThumbsUp className="w-4 h-4" />} Approve
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="px-4 pt-10 pb-4 bg-slate-900/80 border-b border-white/10">
        <div className="flex items-center gap-3 mb-3">
          <button onClick={onBack} className="w-8 h-8 flex items-center justify-center rounded-full bg-white/8 active:scale-90 transition-transform">
            <ArrowLeft className="w-4 h-4 text-white/70" />
          </button>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <Home className="w-4 h-4 text-indigo-400" />
              <h1 className="text-white font-bold text-base">WFH Approvals</h1>
            </div>
            <p className="text-indigo-200/50 text-[11px]">{records.length} pending</p>
          </div>
          <button onClick={load} disabled={loading} className="w-8 h-8 flex items-center justify-center rounded-full bg-white/8 active:scale-90">
            <Loader2 className={`w-4 h-4 text-white/50 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
        <div className="flex items-center gap-2 bg-white/5 border border-white/10 rounded-xl px-3 py-2">
          <Search className="w-3.5 h-3.5 text-white/30 shrink-0" />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search employee or date…"
            className="flex-1 bg-transparent text-white text-sm placeholder-white/25 focus:outline-none" />
          {search && <button onClick={() => setSearch('')}><X className="w-3.5 h-3.5 text-white/30" /></button>}
        </div>
      </div>

      {/* List */}
      <div className="flex-1 px-4 py-3 space-y-3">
        {loading && <div className="flex items-center justify-center py-20"><Loader2 className="w-8 h-8 text-indigo-400 animate-spin" /></div>}
        {!loading && filtered.length === 0 && (
          <div className="text-center py-20">
            <Home className="w-10 h-10 text-white/10 mx-auto mb-3" />
            <p className="text-white/30 text-sm">No pending WFH submissions</p>
          </div>
        )}
        {!loading && filtered.map(rec => {
          const isOpen = expanded === rec.id;
          return (
            <div key={rec.id} className="bg-white/5 border border-white/8 rounded-2xl overflow-hidden">
              <button onClick={() => setExpanded(isOpen ? null : rec.id)}
                className="w-full flex items-start gap-3 p-4 text-left active:bg-white/5 transition-colors">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${STATUS_STYLE[rec.status] || 'bg-white/10 text-white/50 border border-white/20'}`}>
                      {rec.status}
                    </span>
                    {rec.eodSubmittedAt && <span className="text-emerald-300/60 text-[10px]">EOD ✓</span>}
                  </div>
                  <p className="text-white font-semibold text-sm">{rec.employeeName}</p>
                  <p className="text-white/50 text-xs">{fmtDate(rec.attendanceDate)} · {rec.timeIn}</p>
                  <p className="text-white/30 text-xs truncate mt-0.5">{rec.workDescription}</p>
                </div>
                {isOpen ? <ChevronUp className="w-4 h-4 text-white/30 shrink-0 mt-1" /> : <ChevronDown className="w-4 h-4 text-white/30 shrink-0 mt-1" />}
              </button>

              {isOpen && (
                <div className="border-t border-white/8 px-4 pb-4 pt-3 space-y-3">
                  <Section title="Work Description" value={rec.workDescription} />
                  <Section title="Planned Tasks" value={rec.plannedTasks} />
                  <Section title="Expected Deliverables" value={rec.expectedDeliverables} />
                  {rec.additionalNotes && <Section title="Notes" value={rec.additionalNotes} />}

                  {rec.eodSubmittedAt && (
                    <div className="bg-emerald-500/5 border border-emerald-400/15 rounded-xl p-3 space-y-2">
                      <p className="text-emerald-300 text-[11px] font-semibold uppercase tracking-wider">End-of-Day Report</p>
                      <Section title="Summary" value={rec.eodSummary} />
                      <Section title="Accomplishments" value={rec.eodAccomplishments} />
                      <Section title="Issues" value={rec.eodIssues} />
                      <Section title="Deliverables" value={rec.eodDeliverables} />
                      {rec.eodNextDayPlan && <Section title="Next-Day Plan" value={rec.eodNextDayPlan} />}
                    </div>
                  )}

                  {rec.attachments?.length > 0 && (
                    <div>
                      <p className="text-white/30 text-[11px] uppercase tracking-wider mb-1.5">Attachments ({rec.attachments.length})</p>
                      <div className="space-y-1.5">
                        {rec.attachments.map((att, i) => (
                          <a key={i} href={att.fileUrl} target="_blank" rel="noopener noreferrer"
                            className="flex items-center gap-2 bg-white/5 border border-white/8 rounded-lg px-3 py-2 active:scale-95 transition-transform">
                            <Paperclip className="w-3.5 h-3.5 text-white/40 shrink-0" />
                            <span className="text-sky-300 text-xs flex-1 truncate">{att.fileName}</span>
                            <ExternalLink className="w-3 h-3 text-white/20 shrink-0" />
                          </a>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Action buttons */}
                  <div className="grid grid-cols-3 gap-2 pt-1">
                    <button
                      onClick={() => { setActiveRec(rec); setApproveComment(''); setApproveModal(true); }}
                      className="flex items-center justify-center gap-1.5 bg-emerald-500/15 text-emerald-300 border border-emerald-400/25 rounded-xl py-2.5 text-xs font-semibold active:scale-95 transition-transform"
                    >
                      <ThumbsUp className="w-3.5 h-3.5" /> Approve
                    </button>
                    <button
                      onClick={() => { setActiveRec(rec); setInputText(''); setRevisionModal(true); }}
                      className="flex items-center justify-center gap-1.5 bg-orange-500/15 text-orange-300 border border-orange-400/25 rounded-xl py-2.5 text-xs font-semibold active:scale-95 transition-transform"
                    >
                      <RotateCcw className="w-3.5 h-3.5" /> Revise
                    </button>
                    <button
                      onClick={() => { setActiveRec(rec); setInputText(''); setRejectModal(true); }}
                      className="flex items-center justify-center gap-1.5 bg-red-500/15 text-red-300 border border-red-400/25 rounded-xl py-2.5 text-xs font-semibold active:scale-95 transition-transform"
                    >
                      <ThumbsDown className="w-3.5 h-3.5" /> Reject
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Section({ title, value }: { title: string; value?: string }) {
  if (!value) return null;
  return (
    <div>
      <p className="text-white/30 text-[10px] uppercase tracking-wider mb-0.5">{title}</p>
      <p className="text-white/70 text-xs whitespace-pre-wrap">{value}</p>
    </div>
  );
}
