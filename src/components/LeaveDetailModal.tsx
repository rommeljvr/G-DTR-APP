import { useState, useEffect, type ReactNode } from 'react';
import {
  XCircle, CalendarDays, Clock, FileText, User as UserIcon,
  Loader2, ExternalLink, ThumbsUp, ThumbsDown,
  CheckCircle2, AlertCircle,
} from 'lucide-react';
import { LeaveApplication, LeaveApprovalRecord } from '../types';
import { fetchDocumentBase64 } from '../utils/sheets';

interface Props {
  leave: LeaveApplication;
  onClose: () => void;
  /** Optional action buttons shown at bottom */
  actions?: ReactNode;
}

function fmtDate(v: string) {
  if (!v) return '—';
  const d = new Date(v.replace(/-/g, '/'));
  return isNaN(d.getTime()) ? v : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}
function fmtTs(v: string) {
  if (!v) return '—';
  const d = new Date(v);
  return isNaN(d.getTime()) ? v : d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

const STATUS_COLOR: Record<string, string> = {
  Pending:      'bg-amber-400/15 text-amber-300 border-amber-400/30',
  Acknowledged: 'bg-blue-400/15 text-blue-300 border-blue-400/30',
  Approved:     'bg-emerald-400/15 text-emerald-300 border-emerald-400/30',
  Rejected:     'bg-red-400/15 text-red-300 border-red-400/30',
  Cancelled:    'bg-white/10 text-white/40 border-white/10',
};
const ACTION_ICON: Record<string, React.ReactNode> = {
  Acknowledge: <CheckCircle2 className="w-3.5 h-3.5 text-blue-300" />,
  Approve:     <ThumbsUp    className="w-3.5 h-3.5 text-emerald-300" />,
  Reject:      <ThumbsDown  className="w-3.5 h-3.5 text-red-300" />,
};

export default function LeaveDetailModal({ leave, onClose, actions }: Props) {
  const [docLoading, setDocLoading] = useState(false);
  const [docBase64, setDocBase64]   = useState<string | null>(null);
  const [docName, setDocName]       = useState<string | undefined>();
  const [docViewUrl, setDocViewUrl] = useState<string | undefined>();
  const [docError, setDocError]     = useState(false);

  useEffect(() => {
    if (!leave.docId) return;
    setDocLoading(true);
    fetchDocumentBase64(leave.docId).then(({ base64, fileName, viewUrl }) => {
      setDocBase64(base64);
      setDocName(fileName);
      setDocViewUrl(viewUrl);
      setDocLoading(false);
      if (!base64) setDocError(true);
    });
  }, [leave.docId]);

  const isImage = docName ? /\.(png|jpe?g|gif|webp)$/i.test(docName) : false;

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center">
      <div className="bg-slate-900 border border-white/10 rounded-t-3xl sm:rounded-2xl w-full max-w-lg max-h-[92vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-slate-900 border-b border-white/10 px-5 py-4 flex items-center justify-between z-10">
          <h2 className="text-white font-bold">Leave Request Detail</h2>
          <button onClick={onClose} className="w-8 h-8 bg-white/8 rounded-full flex items-center justify-center active:scale-90">
            <XCircle className="w-4 h-4 text-white/60" />
          </button>
        </div>

        <div className="px-5 py-4 space-y-3">
          {/* Employee row */}
          <div className="bg-white/5 rounded-xl p-3 flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-blue-500/20 flex items-center justify-center shrink-0">
              <UserIcon className="w-5 h-5 text-blue-300" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-white font-semibold text-sm">{leave.employeeName}</p>
              <p className="text-white/50 text-xs truncate">{leave.email}</p>
            </div>
            <span className={`shrink-0 text-[10px] font-semibold px-2 py-0.5 rounded-full border ${STATUS_COLOR[leave.status] || 'bg-white/10 text-white/40 border-white/10'}`}>
              {leave.status}
            </span>
          </div>

          {/* Core details grid */}
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div className="bg-white/5 rounded-xl p-3">
              <p className="text-white/40 text-[10px] uppercase tracking-wide mb-1">Leave Type</p>
              <p className="text-white font-medium">{leave.leaveType}</p>
            </div>
            <div className="bg-white/5 rounded-xl p-3">
              <p className="text-white/40 text-[10px] uppercase tracking-wide mb-1">Duration</p>
              <p className="text-white font-medium">{leave.totalDays} day{leave.totalDays !== 1 ? 's' : ''}</p>
            </div>
            <div className="bg-white/5 rounded-xl p-3">
              <p className="text-white/40 text-[10px] uppercase tracking-wide mb-1">From</p>
              <p className="text-white font-medium">{fmtDate(leave.startDate)}</p>
            </div>
            <div className="bg-white/5 rounded-xl p-3">
              <p className="text-white/40 text-[10px] uppercase tracking-wide mb-1">To</p>
              <p className="text-white font-medium">{fmtDate(leave.endDate)}</p>
            </div>
            {leave.mode && (
              <div className="bg-white/5 rounded-xl p-3">
                <p className="text-white/40 text-[10px] uppercase tracking-wide mb-1">Mode</p>
                <p className="text-white font-medium">{leave.mode}{leave.halfDayPeriod ? ` (${leave.halfDayPeriod})` : ''}</p>
              </div>
            )}
            {leave.paymentStatus && (
              <div className="bg-white/5 rounded-xl p-3">
                <p className="text-white/40 text-[10px] uppercase tracking-wide mb-1">Payment</p>
                <p className="text-white font-medium">{leave.paymentStatus}</p>
              </div>
            )}
          </div>

          {/* Reason */}
          {leave.reason && (
            <div className="bg-white/5 rounded-xl p-3">
              <p className="text-white/40 text-[10px] uppercase tracking-wide mb-1">Reason</p>
              <p className="text-white/80 text-sm leading-relaxed">{leave.reason}</p>
            </div>
          )}

          {/* Rejection reason */}
          {leave.rejectionReason && (
            <div className="bg-red-500/10 border border-red-400/20 rounded-xl p-3">
              <p className="text-red-300/70 text-[10px] uppercase tracking-wide mb-1">Rejection Reason</p>
              <p className="text-red-300 text-sm">{leave.rejectionReason}</p>
            </div>
          )}

          {/* Workflow */}
          <div className="bg-white/5 rounded-xl p-3 text-xs text-white/50 space-y-1">
            <p className="flex items-center gap-1.5"><CalendarDays className="w-3 h-3" /><span className="text-white/30">Workflow:</span>{leave.workflowType === 'TWO_STEP' ? 'Two-Step (TL → Approver)' : 'Direct Approval'}</p>
            {leave.teamLeadEmail && <p className="flex items-center gap-1.5"><UserIcon className="w-3 h-3" /><span className="text-white/30">Team Lead:</span>{leave.teamLeadEmail}</p>}
            {leave.approverEmail  && <p className="flex items-center gap-1.5"><UserIcon className="w-3 h-3" /><span className="text-white/30">Approver:</span>{leave.approverEmail}</p>}
            <p className="flex items-center gap-1.5"><Clock className="w-3 h-3" /><span className="text-white/30">Submitted:</span>{fmtTs(leave.submittedAt)}</p>
          </div>

          {/* Document attachment */}
          <div>
            <p className="text-white/40 text-[10px] uppercase tracking-wide mb-2 flex items-center gap-1.5">
              <FileText className="w-3 h-3" /> Supporting Document
            </p>
            {!leave.docId && !leave.documentUrl ? (
              <p className="text-white/30 text-xs italic">No document attached.</p>
            ) : docLoading ? (
              <div className="flex items-center gap-2 text-white/40 text-xs">
                <Loader2 className="w-4 h-4 animate-spin" /> Loading document…
              </div>
            ) : docError ? (
              <div className="flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
                <span className="text-red-300 text-xs">Could not load document.</span>
                {(leave.documentUrl) && (
                  <a href={leave.documentUrl} target="_blank" rel="noreferrer"
                    className="ml-auto flex items-center gap-1 text-blue-300 text-xs underline underline-offset-2">
                    <ExternalLink className="w-3 h-3" /> Open link
                  </a>
                )}
              </div>
            ) : docBase64 ? (
              <div className="rounded-xl overflow-hidden border border-white/10 bg-white/5">
                {isImage ? (
                  <img src={`data:image/*;base64,${docBase64}`} alt="attachment" className="w-full object-contain max-h-64" />
                ) : (
                  <div className="flex items-center gap-3 p-3">
                    <FileText className="w-8 h-8 text-blue-300 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-white text-sm font-medium truncate">{docName || 'Document'}</p>
                      <p className="text-white/40 text-xs">Attached file</p>
                    </div>
                    {docViewUrl && (
                      <a href={docViewUrl} target="_blank" rel="noreferrer"
                        className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-blue-500/20 border border-blue-400/30 text-blue-300 text-xs font-medium">
                        <ExternalLink className="w-3 h-3" /> Open
                      </a>
                    )}
                  </div>
                )}
                {docViewUrl && isImage && (
                  <div className="border-t border-white/10 px-3 py-2 flex justify-end">
                    <a href={docViewUrl} target="_blank" rel="noreferrer"
                      className="flex items-center gap-1 text-blue-300 text-xs">
                      <ExternalLink className="w-3 h-3" /> Open in Drive
                    </a>
                  </div>
                )}
              </div>
            ) : leave.documentUrl ? (
              <a href={leave.documentUrl} target="_blank" rel="noreferrer"
                className="flex items-center gap-2 px-4 py-3 rounded-xl bg-blue-500/10 border border-blue-400/20 text-blue-300 text-sm">
                <ExternalLink className="w-4 h-4" /> View Document
              </a>
            ) : null}
          </div>

          {/* Approval history */}
          {leave.approvalHistory && leave.approvalHistory.length > 0 && (
            <div>
              <p className="text-white/40 text-[10px] uppercase tracking-wide mb-2">Approval History</p>
              <div className="space-y-2">
                {(leave.approvalHistory as LeaveApprovalRecord[]).map((h) => (
                  <div key={h.id} className="flex items-start gap-3 bg-white/5 rounded-xl p-3">
                    <div className="mt-0.5 shrink-0">{ACTION_ICON[h.action] ?? <CheckCircle2 className="w-3.5 h-3.5 text-white/30" />}</div>
                    <div className="flex-1 min-w-0">
                      <p className="text-white/80 text-xs font-medium">{h.approverName}</p>
                      <p className="text-white/50 text-[11px]">{h.action}</p>
                      {h.reason && <p className="text-white/40 text-[11px] mt-0.5">{h.reason}</p>}
                    </div>
                    <p className="text-white/30 text-[10px] shrink-0">{fmtTs(String(h.timestamp))}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Slot for action buttons (Acknowledge / Approve / Reject) */}
          {actions && <div className="flex flex-col gap-2 pt-1 pb-2">{actions}</div>}
        </div>
      </div>
    </div>
  );
}
