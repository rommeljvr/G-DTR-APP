import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  ArrowLeft, RefreshCw, Search, X, CheckCircle2, AlertCircle,
  Loader2, Clock, Check, RotateCcw, XCircle,
} from 'lucide-react';
import { User, OTRequest, OTStatus } from '../types';
import { getOTList, approveOT, returnOT, rejectOT } from '../utils/sheets';
import EmployeeAvatar from './EmployeeAvatar';

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

function fmtHours(h: number) {
  if (!h) return '—';
  const hrs = Math.floor(h), mins = Math.round((h - hrs) * 60);
  return mins > 0 ? `${hrs}h ${mins}m` : `${hrs}h`;
}

// ── Detail / Approval View ───────────────────────────────────────────────────
function OTDetailView({ record, adminEmail, onBack, onActioned }: {
  record: OTRequest; adminEmail: string;
  onBack: () => void; onActioned: () => void;
}) {
  const [acting, setActing] = useState(false);
  const [modal, setModal] = useState<'approve' | 'return' | 'reject' | null>(null);
  const [approvedHours, setApprovedHours] = useState(String(record.totalRequestedHours));
  const [remarks, setRemarks] = useState('');
  const [toast, setToast] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);

  const showToast = (type: 'success' | 'error', msg: string) => { setToast({ type, msg }); setTimeout(() => setToast(null), 3000); };
  const canAct = record.status === 'Submitted' || record.status === 'Pending Approval';

  const handleAction = async () => {
    if (!modal) return;
    if ((modal === 'return' || modal === 'reject') && !remarks.trim()) {
      showToast('error', 'Remarks / reason is required'); return;
    }
    setActing(true);
    let res;
    if (modal === 'approve') res = await approveOT(record.id, adminEmail, parseFloat(approvedHours) || record.totalRequestedHours);
    else if (modal === 'return') res = await returnOT(record.id, adminEmail, remarks);
    else res = await rejectOT(record.id, adminEmail, remarks);
    setActing(false);
    setModal(null);
    if (res.success) { showToast('success', `OT ${modal}d successfully`); setTimeout(onActioned, 800); }
    else showToast('error', res.message);
  };

  return (
    <div className="min-h-dvh bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 flex flex-col pb-28">
      {toast && (
        <div className={`fixed top-4 left-4 right-4 z-50 rounded-xl px-4 py-3 text-sm font-medium text-white shadow-2xl border flex items-center gap-2 ${
          toast.type === 'success' ? 'bg-emerald-600/90 border-emerald-400/30' : 'bg-red-600/90 border-red-400/30'
        }`}>
          {toast.type === 'success' ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
          {toast.msg}
        </div>
      )}

      {/* Action modal */}
      {modal && (
        <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="w-full max-w-md bg-slate-900 border border-white/15 rounded-3xl p-5 space-y-4">
            <h3 className="text-white font-bold text-base capitalize">{modal} OT Request</h3>
            {modal === 'approve' && (
              <div>
                <label className="text-white/50 text-xs">Approved Hours (default: requested hours)</label>
                <input type="number" step="0.25" min="0" value={approvedHours}
                  onChange={e => setApprovedHours(e.target.value)}
                  className="w-full mt-1.5 bg-slate-800 border border-white/10 text-white text-sm rounded-xl px-3 py-2.5 outline-none" />
              </div>
            )}
            {(modal === 'return' || modal === 'reject') && (
              <div>
                <label className="text-white/50 text-xs">{modal === 'return' ? 'Return Remarks' : 'Rejection Reason'} <span className="text-red-400">*</span></label>
                <textarea value={remarks} onChange={e => setRemarks(e.target.value)} rows={3}
                  className="w-full mt-1.5 bg-slate-800 border border-white/10 text-white text-sm rounded-xl px-3 py-2.5 outline-none resize-none" />
              </div>
            )}
            <div className="flex gap-2">
              <button onClick={() => { setModal(null); setRemarks(''); }} className="flex-1 py-3 rounded-2xl bg-white/10 text-white/70 text-sm font-semibold">Cancel</button>
              <button onClick={handleAction} disabled={acting}
                className={`flex-[2] flex items-center justify-center gap-2 py-3 rounded-2xl text-white text-sm font-bold disabled:opacity-50 ${
                  modal === 'approve' ? 'bg-emerald-600' : modal === 'return' ? 'bg-orange-600' : 'bg-red-600'
                }`}>
                {acting ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                Confirm {modal.charAt(0).toUpperCase() + modal.slice(1)}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="bg-slate-900/80 backdrop-blur-xl border-b border-white/10 px-4 pt-12 pb-4 sticky top-0 z-30">
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="w-8 h-8 flex items-center justify-center rounded-xl bg-white/10 active:scale-90 transition-transform">
            <ArrowLeft className="w-4 h-4 text-white" />
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="text-white font-bold text-sm truncate">{record.employeeName}</h1>
            <p className="text-white/40 text-[10px]">OT Request • {record.otDate}</p>
          </div>
          <span className={`text-[9px] font-semibold px-2 py-1 rounded-full border ${STATUS_STYLE[record.status]}`}>{record.status}</span>
        </div>
      </div>

      <div className="flex-1 px-4 pt-4 space-y-4">
        {/* Employee info */}
        <div className="bg-white/5 border border-white/10 rounded-2xl p-4 flex items-center gap-3">
          <EmployeeAvatar src={record.employeeImage} name={record.employeeName} size="md" />
          <div>
            <p className="text-white font-semibold text-sm">{record.employeeName}</p>
            <p className="text-white/40 text-[10px]">{record.department} · {record.designation}</p>
            <p className="text-white/30 text-[10px]">{record.employeeEmail}</p>
          </div>
        </div>

        {/* Times */}
        <div className="bg-white/5 border border-white/10 rounded-2xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-white/50 text-[10px] font-semibold uppercase tracking-wider">Overtime Details</p>
            <span className="text-white/60 text-xs font-semibold">{record.otType}</span>
          </div>
          {(record.otType === 'Pre-Shift' || record.otType === 'Both') && (
            <div className="bg-violet-500/5 border border-violet-400/15 rounded-xl p-3 text-[10px] space-y-1">
              <p className="text-violet-300/70 font-semibold uppercase tracking-wider text-[9px]">Pre-Shift</p>
              <div className="grid grid-cols-2 gap-1">
                <div><span className="text-white/30">Start: </span><span className="text-white/70">{fmt(record.preShiftStart || '')}</span></div>
                <div><span className="text-white/30">End: </span><span className="text-white/70">{fmt(record.preShiftEnd || '')}</span></div>
              </div>
            </div>
          )}
          {(record.otType === 'Post-Shift' || record.otType === 'Both') && (
            <div className="bg-amber-500/5 border border-amber-400/15 rounded-xl p-3 text-[10px] space-y-1">
              <p className="text-amber-300/70 font-semibold uppercase tracking-wider text-[9px]">Post-Shift</p>
              <div className="grid grid-cols-2 gap-1">
                <div><span className="text-white/30">Start: </span><span className="text-white/70">{fmt(record.postShiftStart || '')}</span></div>
                <div><span className="text-white/30">End: </span><span className="text-white/70">{fmt(record.postShiftEnd || '')}</span></div>
              </div>
            </div>
          )}
          <div className="flex items-center justify-between pt-1">
            <span className="text-white/50 text-xs">Total Requested</span>
            <span className="text-white font-bold text-sm">{fmtHours(record.totalRequestedHours)}</span>
          </div>
          {record.approvedHours != null && (
            <div className="flex items-center justify-between">
              <span className="text-white/50 text-xs">Approved Hours</span>
              <span className="text-emerald-300 font-bold text-sm">{fmtHours(record.approvedHours)}</span>
            </div>
          )}
        </div>

        {/* Reason */}
        {record.reason && (
          <div className="bg-white/5 border border-white/10 rounded-2xl p-4 space-y-1">
            <p className="text-white/40 text-[10px] font-semibold uppercase tracking-wider">Justification</p>
            <p className="text-white/80 text-sm">{record.reason}</p>
          </div>
        )}

        {/* Audit Trail */}
        {record.auditTrail?.length > 0 && (
          <div className="bg-white/3 border border-white/8 rounded-2xl overflow-hidden">
            <div className="px-4 py-3 border-b border-white/5">
              <p className="text-white/40 text-[10px] font-semibold uppercase tracking-wider">Audit Trail</p>
            </div>
            <div className="px-4 py-3 space-y-2.5">
              {record.auditTrail.map((entry, i) => (
                <div key={i} className="flex items-start gap-2.5">
                  <div className="w-1.5 h-1.5 rounded-full mt-1.5 shrink-0 bg-blue-400" />
                  <div className="text-[10px]">
                    <span className="text-white/70 font-medium">{entry.action}</span>
                    <span className="text-white/40"> by {entry.by}</span>
                    {entry.remarks && <p className="text-white/40 italic">"{entry.remarks}"</p>}
                    <p className="text-white/25">{fmt(entry.at)}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Action bar */}
      {canAct && (
        <div className="fixed bottom-0 left-0 right-0 bg-slate-900/95 backdrop-blur-xl border-t border-white/10 px-4 py-4 flex gap-2">
          <button onClick={() => setModal('return')}
            className="flex-1 flex items-center justify-center gap-1.5 py-3 rounded-2xl bg-orange-500/15 text-orange-300 border border-orange-400/20 text-xs font-semibold">
            <RotateCcw className="w-3.5 h-3.5" /> Return
          </button>
          <button onClick={() => setModal('reject')}
            className="flex-1 flex items-center justify-center gap-1.5 py-3 rounded-2xl bg-red-500/15 text-red-300 border border-red-400/20 text-xs font-semibold">
            <XCircle className="w-3.5 h-3.5" /> Reject
          </button>
          <button onClick={() => setModal('approve')}
            className="flex-[2] flex items-center justify-center gap-1.5 py-3 rounded-2xl bg-emerald-600 text-white text-sm font-bold">
            <Check className="w-4 h-4" /> Approve
          </button>
        </div>
      )}
    </div>
  );
}

// ── Main List ────────────────────────────────────────────────────────────────
export default function OTManagement({ user, onBack }: Props) {
  const [records, setRecords] = useState<OTRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<OTRequest | null>(null);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState<OTStatus | 'All'>('All');

  const load = useCallback(async () => {
    setLoading(true);
    const res = await getOTList(user.email);
    setRecords(res.records || []);
    setLoading(false);
  }, [user.email]);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    let list = records;
    if (filterStatus !== 'All') list = list.filter(r => r.status === filterStatus);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(r => r.employeeName.toLowerCase().includes(q) || r.employeeEmail.toLowerCase().includes(q));
    }
    return list;
  }, [records, filterStatus, search]);

  const pendingCount = records.filter(r => r.status === 'Submitted' || r.status === 'Pending Approval').length;

  if (selected) {
    return <OTDetailView record={selected} adminEmail={user.email} onBack={() => setSelected(null)} onActioned={() => { setSelected(null); load(); }} />;
  }

  return (
    <div className="min-h-dvh bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 flex flex-col pb-20">
      <div className="bg-slate-900/80 backdrop-blur-xl border-b border-white/10 px-4 pt-12 pb-4 sticky top-0 z-30">
        <div className="flex items-center gap-3 mb-3">
          <button onClick={onBack} className="w-8 h-8 flex items-center justify-center rounded-xl bg-white/10 active:scale-90 transition-transform">
            <ArrowLeft className="w-4 h-4 text-white" />
          </button>
          <div className="flex-1">
            <h1 className="text-white font-bold text-base">OT Management</h1>
            <p className="text-white/40 text-xs">
              {pendingCount > 0 ? `${pendingCount} pending approval` : 'All OT requests'}
            </p>
          </div>
          <button onClick={load} className="w-8 h-8 flex items-center justify-center rounded-xl bg-white/10 active:scale-90">
            <RefreshCw className={`w-4 h-4 text-white ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>

        <div className="flex items-center gap-2 bg-white/5 border border-white/10 rounded-xl px-3 py-2 mb-2">
          <Search className="w-3.5 h-3.5 text-white/30 shrink-0" />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search employee..." className="bg-transparent text-white text-xs flex-1 outline-none placeholder-white/30" />
          {search && <button onClick={() => setSearch('')}><X className="w-3.5 h-3.5 text-white/30" /></button>}
        </div>

        <div className="flex gap-1.5 overflow-x-auto scrollbar-none pb-0.5">
          {(['All', 'Submitted', 'Pending Approval', 'Approved', 'Returned for Revision', 'Rejected'] as const).map(s => (
            <button key={s} onClick={() => setFilterStatus(s)}
              className={`shrink-0 text-[9px] font-semibold px-2.5 py-1 rounded-full border transition-colors ${
                filterStatus === s ? 'bg-blue-500/20 text-blue-300 border-blue-400/30' : 'bg-white/5 text-white/40 border-white/10'
              }`}>{s}</button>
          ))}
        </div>
      </div>

      <div className="flex-1 px-4 pt-4 space-y-2">
        {loading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="bg-white/5 border border-white/8 rounded-2xl h-20 animate-pulse" />
          ))
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center py-16 gap-2">
            <Clock className="w-12 h-12 text-white/10" />
            <p className="text-white/40 text-sm">No OT requests found</p>
          </div>
        ) : filtered.map(r => (
          <button key={r.id} onClick={() => setSelected(r)}
            className="w-full bg-white/5 border border-white/10 rounded-2xl p-4 text-left active:bg-white/8 transition-colors">
            <div className="flex items-center gap-3">
              <EmployeeAvatar src={r.employeeImage} name={r.employeeName} size="sm" />
              <div className="flex-1 min-w-0">
                <p className="text-white font-medium text-sm truncate">{r.employeeName}</p>
                <p className="text-white/40 text-[10px]">{r.otDate} · {r.otType} · {fmtHours(r.totalRequestedHours)}</p>
              </div>
              <div className="text-right shrink-0">
                <span className={`text-[8px] font-semibold px-1.5 py-0.5 rounded-full border ${STATUS_STYLE[r.status]}`}>{r.status}</span>
                {r.approvedHours != null && (
                  <p className="text-emerald-300 text-[9px] mt-0.5">Approved: {fmtHours(r.approvedHours)}</p>
                )}
              </div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
