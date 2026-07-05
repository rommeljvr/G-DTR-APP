import { useState, useEffect, useCallback } from 'react';
import { ArrowLeft, Loader2, Search, X, ExternalLink, ChevronDown, ChevronUp, Home, FileText, Paperclip } from 'lucide-react';
import { User, WFHRecord } from '../types';
import { getWFHHistory } from '../utils/sheets';

interface Props {
  user: User;
  onBack: () => void;
}

const STATUS_STYLE: Record<string, string> = {
  Draft:              'bg-slate-400/15 text-slate-300 border-slate-400/30',
  Submitted:          'bg-blue-400/15 text-blue-300 border-blue-400/30',
  'Pending Review':   'bg-amber-400/15 text-amber-300 border-amber-400/30',
  'Revision Required':'bg-orange-400/15 text-orange-300 border-orange-400/30',
  Resubmitted:        'bg-violet-400/15 text-violet-300 border-violet-400/30',
  Approved:           'bg-emerald-400/15 text-emerald-300 border-emerald-400/30',
  Rejected:           'bg-red-400/15 text-red-300 border-red-400/30',
  Closed:             'bg-slate-500/15 text-slate-400 border-slate-500/30',
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

export default function WFHHistory({ user, onBack }: Props) {
  const [records, setRecords]   = useState<WFHRecord[]>([]);
  const [loading, setLoading]   = useState(true);
  const [search, setSearch]     = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await getWFHHistory(user.email);
    setRecords(res.records || []);
    setLoading(false);
  }, [user.email]);

  useEffect(() => { load(); }, [load]);

  const filtered = records.filter(r => {
    const q = search.toLowerCase();
    const matchSearch = !q || r.attendanceDate.includes(q) || r.workDescription.toLowerCase().includes(q) || r.status.toLowerCase().includes(q);
    const matchStatus = !statusFilter || r.status === statusFilter;
    return matchSearch && matchStatus;
  });

  const allStatuses = Array.from(new Set(records.map(r => r.status)));

  return (
    <div className="min-h-dvh bg-gradient-to-br from-slate-900 via-sky-950 to-slate-900 flex flex-col pb-20">
      {/* Header */}
      <div className="px-4 pt-10 pb-4 bg-slate-900/80 border-b border-white/10">
        <div className="flex items-center gap-3 mb-3">
          <button onClick={onBack} className="w-8 h-8 flex items-center justify-center rounded-full bg-white/8 active:scale-90 transition-transform">
            <ArrowLeft className="w-4 h-4 text-white/70" />
          </button>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <Home className="w-4 h-4 text-sky-400" />
              <h1 className="text-white font-bold text-base">WFH History</h1>
            </div>
            <p className="text-sky-200/50 text-[11px]">{records.length} record{records.length !== 1 ? 's' : ''}</p>
          </div>
          <button onClick={load} disabled={loading} className="w-8 h-8 flex items-center justify-center rounded-full bg-white/8 active:scale-90">
            <Loader2 className={`w-4 h-4 text-white/50 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>

        {/* Search + filter */}
        <div className="flex gap-2">
          <div className="flex-1 flex items-center gap-2 bg-white/5 border border-white/10 rounded-xl px-3 py-2">
            <Search className="w-3.5 h-3.5 text-white/30 shrink-0" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search by date or description…"
              className="flex-1 bg-transparent text-white text-sm placeholder-white/25 focus:outline-none"
            />
            {search && <button onClick={() => setSearch('')}><X className="w-3.5 h-3.5 text-white/30" /></button>}
          </div>
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
            className="bg-white/5 border border-white/10 rounded-xl px-2 py-2 text-white/70 text-xs focus:outline-none"
          >
            <option value="">All</option>
            {allStatuses.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
      </div>

      {/* List */}
      <div className="flex-1 px-4 py-3 space-y-3">
        {loading && (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 text-sky-400 animate-spin" />
          </div>
        )}
        {!loading && filtered.length === 0 && (
          <div className="text-center py-20">
            <Home className="w-10 h-10 text-white/10 mx-auto mb-3" />
            <p className="text-white/30 text-sm">No WFH records found</p>
          </div>
        )}
        {!loading && filtered.map(rec => {
          const isOpen = expanded === rec.id;
          return (
            <div key={rec.id} className="bg-white/5 border border-white/8 rounded-2xl overflow-hidden">
              {/* Card header */}
              <button
                onClick={() => setExpanded(isOpen ? null : rec.id)}
                className="w-full flex items-start gap-3 p-4 text-left active:bg-white/5 transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${STATUS_STYLE[rec.status] || 'bg-white/10 text-white/50 border-white/20'}`}>
                      {rec.status}
                    </span>
                    <span className="text-white/30 text-[10px]">v{rec.version}</span>
                    {rec.revisionCount > 0 && <span className="text-orange-300/60 text-[10px]">Rev #{rec.revisionCount}</span>}
                  </div>
                  <p className="text-white font-semibold text-sm">{fmtDate(rec.attendanceDate)}</p>
                  <p className="text-white/50 text-xs truncate mt-0.5">{rec.workDescription}</p>
                  <p className="text-white/25 text-[10px] mt-1">{fmtDateTime(rec.submittedAt)}</p>
                </div>
                {isOpen ? <ChevronUp className="w-4 h-4 text-white/30 shrink-0 mt-1" /> : <ChevronDown className="w-4 h-4 text-white/30 shrink-0 mt-1" />}
              </button>

              {/* Expanded detail */}
              {isOpen && (
                <div className="border-t border-white/8 px-4 pb-4 space-y-3 pt-3">
                  {/* Attendance */}
                  <div className="grid grid-cols-2 gap-2 text-[11px]">
                    <div className="bg-white/3 rounded-lg p-2">
                      <p className="text-white/30 mb-0.5">Time In</p>
                      <p className="text-white font-medium">{rec.timeIn || '—'}</p>
                    </div>
                    <div className="bg-white/3 rounded-lg p-2">
                      <p className="text-white/30 mb-0.5">Time Out</p>
                      <p className="text-white font-medium">{rec.timeOut || '—'}</p>
                    </div>
                  </div>

                  {/* Planned work */}
                  <Section title="Work Description" value={rec.workDescription} />
                  <Section title="Planned Tasks" value={rec.plannedTasks} />
                  <Section title="Expected Deliverables" value={rec.expectedDeliverables} />
                  {rec.additionalNotes && <Section title="Notes" value={rec.additionalNotes} />}

                  {/* EOD */}
                  {rec.eodSubmittedAt && (
                    <div className="bg-emerald-500/5 border border-emerald-400/15 rounded-xl p-3 space-y-2">
                      <p className="text-emerald-300 text-[11px] font-semibold uppercase tracking-wider">End-of-Day Report</p>
                      <Section title="Summary" value={rec.eodSummary} />
                      <Section title="Accomplishments" value={rec.eodAccomplishments} />
                      <Section title="Issues" value={rec.eodIssues} />
                      <Section title="Deliverables" value={rec.eodDeliverables} />
                      {rec.eodNextDayPlan && <Section title="Next-Day Plan" value={rec.eodNextDayPlan} />}
                      <p className="text-emerald-300/40 text-[10px]">Submitted: {fmtDateTime(rec.eodSubmittedAt)}</p>
                    </div>
                  )}

                  {/* Attachments */}
                  {rec.attachments?.length > 0 && (
                    <div>
                      <p className="text-white/30 text-[11px] uppercase tracking-wider mb-1.5">Attachments</p>
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

                  {/* Approval info */}
                  {rec.approverName && (
                    <div className="bg-white/3 rounded-xl p-3 text-[11px] space-y-0.5">
                      <p className="text-white/30 uppercase tracking-wider">Approver</p>
                      <p className="text-white font-medium">{rec.approverName}</p>
                      {rec.approvalComments && <p className="text-white/50 mt-1">{rec.approvalComments}</p>}
                      {rec.approvedAt && <p className="text-white/25">{fmtDateTime(rec.approvedAt)}</p>}
                    </div>
                  )}

                  {/* Audit trail */}
                  {rec.auditTrail?.length > 0 && (
                    <div>
                      <p className="text-white/30 text-[11px] uppercase tracking-wider mb-1.5">Audit Trail</p>
                      <div className="space-y-1.5">
                        {rec.auditTrail.map((entry, i) => (
                          <div key={i} className="flex items-start gap-2 text-[10px]">
                            <div className="w-1.5 h-1.5 rounded-full bg-white/20 mt-1 shrink-0" />
                            <div className="flex-1 min-w-0">
                              <span className="text-white/60">{entry.action.replace(/_/g, ' ')}</span>
                              {entry.comments && <span className="text-white/30"> — {entry.comments}</span>}
                              <p className="text-white/20">{fmtDateTime(entry.timestamp)} · {entry.by}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
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
