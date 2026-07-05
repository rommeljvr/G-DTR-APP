import { useState, useRef } from 'react';
import { ArrowLeft, Loader2, CheckCircle2, AlertCircle, Paperclip, X, FileText, Upload } from 'lucide-react';
import { WFHRecord, WFHAttachment } from '../types';
import { submitWFHEOD, resubmitWFHEOD } from '../utils/sheets';

interface Props {
  user: { email: string; name: string };
  wfhRecord: WFHRecord;
  onSuccess: (attachments: WFHAttachment[]) => void;
  onCancel: () => void;
  revisionMode?: boolean;
}

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB
const ACCEPTED = '.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.png,.jpg,.jpeg,.gif,.webp,.txt,.csv';

// Defined outside component — stable identity prevents textarea unmount/keyboard-dismiss on each keystroke
function EODField({
  label, value, onChange, placeholder, required, rows = 3,
}: {
  label: string; value: string; onChange: (v: string) => void;
  placeholder: string; required?: boolean; rows?: number;
}) {
  return (
    <div>
      <label className="text-white/50 text-[11px] uppercase tracking-wider block mb-1.5">
        {label}{required && <span className="text-rose-400 ml-0.5">*</span>}
      </label>
      <textarea
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        rows={rows}
        className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-white text-sm placeholder-white/20 focus:outline-none focus:border-emerald-400/50 resize-none"
      />
    </div>
  );
}

export default function EODReport({ user, wfhRecord, onSuccess, onCancel, revisionMode = false }: Props) {
  const [form, setForm] = useState({
    eodSummary:         revisionMode ? (wfhRecord.eodSummary         || '') : '',
    eodAccomplishments: revisionMode ? (wfhRecord.eodAccomplishments || '') : '',
    eodIssues:          revisionMode ? (wfhRecord.eodIssues          || '') : '',
    eodDeliverables:    revisionMode ? (wfhRecord.eodDeliverables    || '') : '',
    eodNextDayPlan:     revisionMode ? (wfhRecord.eodNextDayPlan     || '') : '',
    eodRemarks:         revisionMode ? (wfhRecord.eodRemarks         || '') : '',
  });
  // TC Filing pattern: File ref set synchronously + documentData set by reader.onload
  // Validation checks documentFile (sync) — never the async-loaded data
  const existingAttachments = revisionMode ? (wfhRecord.attachments || []) : [];
  const [keepExisting, setKeepExisting] = useState(existingAttachments.length > 0);
  const [documentFile, setDocumentFile] = useState<File | null>(null);
  const [documentData, setDocumentData] = useState<string>('');
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const showToast = (type: 'success' | 'error', msg: string) => {
    setToast({ type, msg });
    setTimeout(() => setToast(null), 4000);
  };

  const setField = (field: keyof typeof form) => (value: string) =>
    setForm(prev => ({ ...prev, [field]: value }));

  // Mirrors TC Filing handleFileChange exactly
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0] ?? null;
    setDocumentFile(f);           // set synchronously — validation reads this
    setDocumentData('');          // clear previous data while loading
    if (f) setKeepExisting(false); // selecting a new file always replaces existing
    if (f) {
      if (f.size > MAX_FILE_SIZE) {
        showToast('error', `${f.name} exceeds 10 MB limit.`);
        setDocumentFile(null);
        e.target.value = '';
        return;
      }
      const reader = new FileReader();
      reader.onload = () => setDocumentData(reader.result as string);
      reader.readAsDataURL(f);
    }
    e.target.value = '';
  };

  const formatSize = (bytes: number) => bytes < 1024 * 1024
    ? (bytes / 1024).toFixed(1) + ' KB'
    : (bytes / (1024 * 1024)).toFixed(1) + ' MB';

  const handleSubmit = async () => {
    if (!form.eodSummary.trim())        { showToast('error', 'Summary of Completed Work is required.'); return; }
    if (!form.eodAccomplishments.trim()){ showToast('error', 'Accomplishments is required.'); return; }
    if (!form.eodIssues.trim())         { showToast('error', 'Issues Encountered is required.'); return; }
    if (!form.eodDeliverables.trim())   { showToast('error', 'Deliverables Completed is required.'); return; }
    // In revision mode: attachment required only when existing was cleared
    const needsNewFile = !revisionMode || !keepExisting;
    if (needsNewFile && !documentFile)  { showToast('error', 'A supporting attachment is required.'); return; }
    if (needsNewFile && !documentData)  { showToast('error', 'File is still loading, please wait a moment.'); return; }

    setSaving(true);
    const submitFn = revisionMode ? resubmitWFHEOD : submitWFHEOD;
    // Send new file when provided; empty array signals backend to keep existing attachments
    const attachments = (needsNewFile && documentFile)
      ? [{ fileName: documentFile.name, fileData: documentData, mimeType: documentFile.type || 'application/octet-stream' }]
      : [];
    const res = await submitFn({
      wfhId:              wfhRecord.id,
      email:              user.email,
      eodSummary:         form.eodSummary.trim(),
      eodAccomplishments: form.eodAccomplishments.trim(),
      eodIssues:          form.eodIssues.trim(),
      eodDeliverables:    form.eodDeliverables.trim(),
      eodNextDayPlan:     form.eodNextDayPlan.trim() || undefined,
      eodRemarks:         form.eodRemarks.trim() || undefined,
      attachments,
    });
    setSaving(false);
    if (res.success) {
      showToast('success', revisionMode ? 'Revised EOD Report submitted successfully!' : 'End-of-Day Report submitted! You may now clock out.');
      setTimeout(() => onSuccess(res.attachments || []), 1500);
    } else {
      showToast('error', res.message || 'Submission failed. Please try again.');
    }
  };

  return (
    // fixed inset-0 keeps layout stable when soft keyboard appears — body scrolls internally
    <div className="fixed inset-0 bg-gradient-to-br from-slate-900 via-emerald-950 to-slate-900 flex flex-col overflow-hidden">
      {toast && (
        <div className={`fixed top-4 left-1/2 -translate-x-1/2 z-50 px-5 py-3 rounded-xl shadow-xl flex items-center gap-2 text-sm font-medium w-[90vw] max-w-sm
          ${toast.type === 'success' ? 'bg-emerald-500/90 text-white' : 'bg-red-500/90 text-white'}`}>
          {toast.type === 'success' ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
          {toast.msg}
        </div>
      )}

      {/* Header – never scrolls away */}
      <div className="px-4 pt-10 pb-4 bg-slate-900/80 border-b border-white/10 shrink-0">
        <div className="flex items-center gap-3">
          <button onClick={onCancel} className="w-8 h-8 flex items-center justify-center rounded-full bg-white/8 active:scale-90 transition-transform">
            <ArrowLeft className="w-4 h-4 text-white/70" />
          </button>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <FileText className="w-4 h-4 text-emerald-400" />
              <h1 className="text-white font-bold text-base">End-of-Day Report</h1>
            </div>
            <p className="text-emerald-200/50 text-[11px] mt-0.5">{revisionMode ? 'Revise and resubmit your EOD report' : 'Required before clocking out'}</p>
          </div>
        </div>
      </div>

      {/* Scrollable body */}
      <div className="flex-1 overflow-y-auto">
        <div className="px-4 pt-4 pb-8 space-y-4">

          {/* Info bar */}
          <div className="bg-amber-500/10 border border-amber-400/20 rounded-xl px-4 py-3 text-[11px] text-amber-300/80">
            <p className="font-semibold text-amber-300 mb-0.5">WFH: {wfhRecord.attendanceDate}</p>
            <p className="text-amber-200/50 truncate">{wfhRecord.workDescription}</p>
          </div>

          {/* Revision banner */}
          {revisionMode && wfhRecord.approvalComments && (
            <div className="bg-orange-500/10 border border-orange-400/25 rounded-xl px-4 py-3">
              <p className="text-orange-300 text-[11px] font-semibold uppercase tracking-wider mb-1">Revision Requested</p>
              <p className="text-orange-200/70 text-xs">{wfhRecord.approvalComments}</p>
            </div>
          )}

          <EODField label="Summary of Completed Work" value={form.eodSummary} onChange={setField('eodSummary')} placeholder="Summarise what you accomplished today…" required rows={3} />
          <EODField label="Accomplishments" value={form.eodAccomplishments} onChange={setField('eodAccomplishments')} placeholder="List your key accomplishments…" required rows={4} />
          <EODField label="Issues Encountered" value={form.eodIssues} onChange={setField('eodIssues')} placeholder="Describe any issues or blockers encountered…" required rows={3} />
          <EODField label="Deliverables Completed" value={form.eodDeliverables} onChange={setField('eodDeliverables')} placeholder="List the deliverables you completed…" required rows={3} />
          <EODField label="Next-Day Plan" value={form.eodNextDayPlan} onChange={setField('eodNextDayPlan')} placeholder="What do you plan to do tomorrow? (optional)…" rows={2} />
          <EODField label="Additional Remarks" value={form.eodRemarks} onChange={setField('eodRemarks')} placeholder="Any additional remarks (optional)…" rows={2} />

          {/* Attachments */}
          <div>
            <label className="text-white/50 text-[11px] uppercase tracking-wider block mb-1.5">
              Supporting Attachments{(!revisionMode || !keepExisting) && <span className="text-rose-400 ml-0.5">*</span>}
            </label>
            <input ref={fileRef} type="file" accept={ACCEPTED} onChange={handleFileChange} className="hidden" />

            {/* Existing attachment chip (revision mode only) */}
            {revisionMode && existingAttachments.length > 0 && keepExisting && (
              <div className="mb-2 space-y-1.5">
                {existingAttachments.map((att, i) => (
                  <div key={i} className="flex items-center gap-2 bg-sky-500/8 border border-sky-400/20 rounded-xl px-3 py-2">
                    <Paperclip className="w-3.5 h-3.5 text-sky-400/60 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sky-200 text-xs truncate">{att.fileName}</p>
                      <p className="text-sky-300/40 text-[10px]">Existing attachment — kept</p>
                    </div>
                    <button
                      onClick={() => { setKeepExisting(false); setDocumentFile(null); setDocumentData(''); }}
                      className="w-6 h-6 flex items-center justify-center rounded-full bg-white/8 active:scale-90"
                      title="Remove and replace"
                    >
                      <X className="w-3 h-3 text-white/50" />
                    </button>
                  </div>
                ))}
                <button
                  onClick={() => fileRef.current?.click()}
                  className="w-full border border-dashed border-sky-400/20 rounded-xl py-2.5 flex items-center justify-center gap-2 text-sky-300/40 text-xs active:scale-[0.98] transition-transform"
                >
                  <Upload className="w-4 h-4" />
                  Replace with a different file
                </button>
              </div>
            )}

            {/* New file picker (always shown when no existing kept, or to replace) */}
            {(!revisionMode || !keepExisting) && (
              !documentFile ? (
                <button
                  onClick={() => fileRef.current?.click()}
                  className="w-full border border-dashed border-white/20 rounded-xl py-4 flex flex-col items-center gap-2 text-white/40 hover:bg-white/3 active:scale-[0.98] transition-transform"
                >
                  <Upload className="w-5 h-5" />
                  <span className="text-xs">Tap to attach a file</span>
                  <span className="text-[10px] text-white/20">PDF, Word, Excel, Images — max 10 MB</span>
                </button>
              ) : (
                <div className="flex items-center gap-2 bg-white/5 border border-white/8 rounded-xl px-3 py-2">
                  <Paperclip className="w-3.5 h-3.5 text-white/40 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-white text-xs truncate">{documentFile.name}</p>
                    <p className="text-white/30 text-[10px]">
                      {formatSize(documentFile.size)}{!documentData && ' — loading…'}
                    </p>
                  </div>
                  <button
                    onClick={() => { setDocumentFile(null); setDocumentData(''); }}
                    className="w-6 h-6 flex items-center justify-center rounded-full bg-white/8 active:scale-90"
                  >
                    <X className="w-3 h-3 text-white/50" />
                  </button>
                </div>
              )
            )}
          </div>

          <button
            onClick={handleSubmit}
            disabled={saving}
            className="w-full bg-gradient-to-r from-emerald-600 to-teal-600 text-white font-bold py-3.5 rounded-2xl flex items-center justify-center gap-2 active:scale-[0.97] transition-transform disabled:opacity-60 shadow-lg"
          >
            {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <FileText className="w-5 h-5" />}
            {saving ? 'Submitting…' : revisionMode ? 'Resubmit Revised EOD Report' : 'Submit End-of-Day Report'}
          </button>

        </div>
      </div>
    </div>
  );
}
