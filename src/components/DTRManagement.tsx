import { useState, useEffect, useCallback } from 'react';
import React from 'react';
import {
  ArrowLeft, FileText, RefreshCw, Loader2, Plus, Search, Filter,
  CheckCircle2, Clock, AlertCircle, RotateCcw, X, Eye,
  Calendar, Building2, Briefcase, ChevronDown, User as UserIcon,
} from 'lucide-react';
import { User, DTRRecord, DTRStatus, DTRCutOff } from '../types';
import { generateDTR, regenerateDTR, getDTRList, getEmployeeDTRList, resolveDTRIssue, getDTRById, getEmployees, EmployeeRecord } from '../utils/sheets';
import DTRView from './DTRView';

interface Props {
  user: User;
  onBack: () => void;
}

const MONTHS = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
];

const STATUS_STYLE: Record<DTRStatus, string> = {
  'Draft':              'bg-slate-500/20 text-slate-300 border-slate-400/20',
  'Generated':          'bg-blue-500/20 text-blue-300 border-blue-400/20',
  'Sent to Employee':   'bg-violet-500/20 text-violet-300 border-violet-400/20',
  'Acknowledged':       'bg-emerald-500/20 text-emerald-300 border-emerald-400/20',
  'Returned for Review':'bg-amber-500/20 text-amber-300 border-amber-400/20',
  'Regenerated':        'bg-orange-500/20 text-orange-300 border-orange-400/20',
  'Finalized':          'bg-teal-500/20 text-teal-300 border-teal-400/20',
};

function fmtDate(val: string): string {
  if (!val) return '—';
  const d = new Date(val);
  if (isNaN(d.getTime())) return val;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function cutOffLabel(month: number, year: number, cutOff: DTRCutOff): string {
  const mon = MONTHS[month - 1] || '';
  const range = cutOff === '1st' ? '1–15' : `16–${new Date(year, month, 0).getDate()}`;
  return `${mon} ${year} • ${cutOff} Cut-Off (${range})`;
}

// ── Custom dark-themed select dropdown ─────────────────────────────────────
function SelectField<T extends string | number>({ label, value, onChange, children }: {
  label: string; value: T; onChange: (v: T) => void; children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  // Find the selected label from children
  const opts: { value: T; label: string }[] = [];
  React.Children.forEach(children, (child: any) => {
    if (child?.props) opts.push({ value: child.props.value, label: child.props.children });
  });
  const selectedLabel = opts.find(o => String(o.value) === String(value))?.label ?? String(value);

  return (
    <div className="relative">
      <label className="text-white/50 text-xs mb-1 block">{label}</label>
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className={`w-full flex items-center justify-between gap-2 bg-slate-800 border rounded-xl px-3 py-2.5 text-sm text-left transition-colors ${
          open ? 'border-blue-400/50' : 'border-white/10'
        }`}
      >
        <span className="text-white font-medium">{selectedLabel}</span>
        <ChevronDown className={`w-4 h-4 text-white/40 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="absolute z-30 mt-1 w-full bg-slate-800 border border-white/10 rounded-xl shadow-xl overflow-hidden max-h-52 overflow-y-auto">
          {opts.map(opt => (
            <button
              key={String(opt.value)}
              type="button"
              onClick={() => { onChange(opt.value); setOpen(false); }}
              className={`w-full text-left px-4 py-2.5 text-sm transition-colors hover:bg-white/8 ${
                String(opt.value) === String(value) ? 'text-blue-300 bg-blue-500/10' : 'text-white/80'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Searchable employee picker (same pattern as ApproverSettings) ───────────
function EmployeeSelect({
  value, employees, onChange,
}: {
  value: string;
  employees: EmployeeRecord[];
  onChange: (email: string, name: string) => void;
}) {
  const [query, setQuery] = useState('');
  const [open, setOpen]   = useState(false);
  const selected = employees.find(e => e.email.toLowerCase() === value.toLowerCase());
  const filtered = query.trim()
    ? employees.filter(e =>
        e.name.toLowerCase().includes(query.toLowerCase()) ||
        e.email.toLowerCase().includes(query.toLowerCase())
      )
    : employees;

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className={`w-full flex items-center gap-2 bg-white/5 border rounded-xl px-3 py-2.5 text-sm text-left transition-colors ${
          open ? 'border-blue-400/50' : 'border-white/10'
        }`}
      >
        {selected ? (
          selected.image && selected.image.startsWith('http') ? (
            <img src={selected.image} alt="" className="w-8 h-8 rounded-full object-cover shrink-0"
              onError={(e: any) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
          ) : (
            <div className="w-8 h-8 rounded-full bg-blue-500/20 flex items-center justify-center shrink-0">
              <UserIcon className="w-4 h-4 text-blue-300" />
            </div>
          )
        ) : (
          <div className="w-8 h-8 rounded-full bg-white/8 flex items-center justify-center shrink-0">
            <UserIcon className="w-4 h-4 text-white/30" />
          </div>
        )}
        <div className="flex-1 min-w-0">
          {selected ? (
            <>
              <p className="text-white font-medium truncate leading-tight">{selected.name}</p>
              <p className="text-white/40 text-[11px] truncate">{selected.email}</p>
            </>
          ) : (
            <p className="text-white/30">— Select employee —</p>
          )}
        </div>
        <ChevronDown className={`w-4 h-4 text-white/40 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute z-20 mt-1 w-full bg-slate-800 border border-white/10 rounded-xl shadow-xl overflow-hidden">
          <div className="flex items-center gap-2 px-3 py-2 border-b border-white/10">
            <Search className="w-3.5 h-3.5 text-white/40 shrink-0" />
            <input
              autoFocus
              value={query}
              onChange={(e: { target: { value: string } }) => setQuery(e.target.value)}
              placeholder="Search name or email…"
              className="flex-1 bg-transparent text-white text-sm placeholder-white/30 focus:outline-none"
            />
          </div>
          <div className="max-h-48 overflow-y-auto">
            <button
              onClick={() => { onChange('', ''); setOpen(false); setQuery(''); }}
              className="w-full text-left px-4 py-2.5 text-white/40 text-sm hover:bg-white/5"
            >
              — None —
            </button>
            {filtered.length === 0 && (
              <p className="px-4 py-3 text-white/30 text-sm">No employees found</p>
            )}
            {filtered.map(emp => (
              <button
                key={emp.email}
                onClick={() => { onChange(emp.email, emp.name); setOpen(false); setQuery(''); }}
                className={`w-full flex items-center gap-3 text-left px-3 py-2 hover:bg-white/8 transition-colors ${
                  emp.email.toLowerCase() === value.toLowerCase() ? 'bg-blue-500/15' : ''
                }`}
              >
                {emp.image && emp.image.startsWith('http') ? (
                  <img src={emp.image} alt="" className="w-8 h-8 rounded-full object-cover shrink-0"
                    onError={(e: any) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                ) : (
                  <div className="w-8 h-8 rounded-full bg-blue-500/20 flex items-center justify-center shrink-0">
                    <UserIcon className="w-4 h-4 text-blue-300" />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="text-white text-sm font-medium truncate">{emp.name}</p>
                  <p className="text-white/40 text-[11px] truncate">{emp.email}</p>
                  {emp.department && <p className="text-blue-300/50 text-[10px]">{emp.department}</p>}
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default function DTRManagement({ user, onBack }: Props) {
  const now = new Date();
  const [records, setRecords] = useState<DTRRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewDTR, setViewDTR] = useState<DTRRecord | null>(null);
  const [showGenerate, setShowGenerate] = useState(false);
  const [actingId, setActingId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);

  // Employee list for searchable picker
  const [employees, setEmployees] = useState<EmployeeRecord[]>([]);
  const [empLoading, setEmpLoading] = useState(false);

  // Generate form state
  const [genMonth, setGenMonth] = useState(now.getMonth() + 1);
  const [genYear, setGenYear]   = useState(now.getFullYear());
  const [genCutOff, setGenCutOff] = useState<DTRCutOff>('1st');
  const [genEmpEmail, setGenEmpEmail] = useState('');
  const [generating, setGenerating] = useState(false);

  // Filter state
  const [filterSearch, setFilterSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState<DTRStatus | ''>('');
  const [filterMonth, setFilterMonth]   = useState<number | ''>('');
  const [filterYear, setFilterYear]     = useState<number | ''>(now.getFullYear());
  const [filterCutOff, setFilterCutOff] = useState<DTRCutOff | ''>('');
  const [showFilters, setShowFilters]   = useState(false);

  const isAdmin = user.email?.toLowerCase() === 'rommeljvr@gmail.com' ||
    user.employee?.role?.toLowerCase() === 'admin' ||
    user.employee?.role?.toLowerCase() === 'superadmin';

  const showToast = (type: 'success' | 'error', msg: string) => {
    setToast({ type, msg });
    setTimeout(() => setToast(null), 3500);
  };

  const load = useCallback(async () => {
    setLoading(true);
    const res = isAdmin
      ? await getDTRList(user.email)
      : await getEmployeeDTRList(user.email);
    setRecords(res.records || []);
    setLoading(false);
  }, [user.email, isAdmin]);

  // Load employee list when generate modal opens (admin only)
  const loadEmployees = useCallback(async () => {
    if (!isAdmin || employees.length > 0) return;
    setEmpLoading(true);
    const res = await getEmployees();
    if (res.success) setEmployees(res.employees.filter((e: EmployeeRecord) => e.active !== false));
    setEmpLoading(false);
  }, [isAdmin, employees.length]);

  useEffect(() => { load(); }, [load]);

  const openDTR = async (id: string) => {
    setActingId(id);
    const res = await getDTRById(id, user.email);
    setActingId(null);
    if (res.success && res.record) setViewDTR(res.record);
    else showToast('error', res.message || 'Failed to load DTR');
  };

  const handleGenerate = async () => {
    if (!isAdmin) { showToast('error', 'Unauthorized'); return; }
    if (!genEmpEmail.trim()) {
      showToast('error', 'Please select an employee');
      return;
    }
    setGenerating(true);
    const res = await generateDTR({
      adminEmail: user.email,
      employeeEmail: genEmpEmail.trim(),
      month: genMonth, year: genYear, cutOff: genCutOff,
    });
    setGenerating(false);
    if (res.success && res.dtrId) {
      setShowGenerate(false);
      setGenEmpEmail('');
      // Pre-focus the list on this period
      setFilterMonth(genMonth);
      setFilterYear(genYear);
      setFilterCutOff(genCutOff);
      await load();
      showToast('success', 'DTR generated — opening record…');
      openDTR(res.dtrId);
    } else if (res.success) {
      showToast('success', 'DTR generated successfully');
      setShowGenerate(false);
      setGenEmpEmail('');
      load();
    } else {
      showToast('error', res.message || 'Generation failed');
    }
  };

  const handleRegenerate = async (id: string) => {
    if (!isAdmin) { showToast('error', 'Unauthorized'); return; }
    setActingId(id);
    const res = await regenerateDTR(id, user.email);
    setActingId(null);
    if (res.success) {
      // The regenerated record gets a new dtrId; fall back to original id if not returned
      const newId = res.dtrId || id;
      await load();
      showToast('success', 'DTR regenerated — opening record…');
      openDTR(newId);
    } else {
      showToast('error', res.message || 'Failed');
    }
  };

  const handleViewFull = async (id: string) => {
    openDTR(id);
  };

  const handleResolveIssue = async (issueId: string) => {
    if (!isAdmin) { showToast('error', 'Unauthorized'); return; }
    const res = await resolveDTRIssue(issueId, user.email);
    if (res.success) { showToast('success', 'Issue resolved'); load(); }
    else showToast('error', res.message || 'Failed');
  };

  // Employees must only ever see their own records (second safety layer on top of backend)
  const ownedRecords = isAdmin
    ? records
    : records.filter(r => r.employeeEmail.toLowerCase() === user.email.toLowerCase());

  const filtered = ownedRecords.filter(r => {
    if (filterSearch && !r.employeeName.toLowerCase().includes(filterSearch.toLowerCase()) &&
        !r.employeeEmail.toLowerCase().includes(filterSearch.toLowerCase())) return false;
    if (filterStatus && r.status !== filterStatus) return false;
    if (filterMonth && r.month !== filterMonth) return false;
    if (filterYear && r.year !== Number(filterYear)) return false;
    if (filterCutOff && r.cutOff !== filterCutOff) return false;
    return true;
  });

  // Summary stats (scoped to owned records)
  const stats = {
    total:       ownedRecords.length,
    generated:   ownedRecords.filter(r => r.status === 'Generated' || r.status === 'Sent to Employee').length,
    acknowledged:ownedRecords.filter(r => r.status === 'Acknowledged').length,
    issues:      ownedRecords.filter(r => r.status === 'Returned for Review').length,
  };

  if (viewDTR) {
    return (
      <DTRView
        dtr={viewDTR}
        user={user}
        isAdmin={isAdmin}
        onBack={() => { setViewDTR(null); load(); }}
        onRegenerate={isAdmin ? (id: string) => { setViewDTR(null); handleRegenerate(id); } : undefined}
        onResolveIssue={isAdmin ? handleResolveIssue : undefined}
      />
    );
  }

  const yearOptions = [now.getFullYear(), now.getFullYear() - 1, now.getFullYear() + 1];

  return (
    <div className="min-h-dvh bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 flex flex-col pb-20">
      {/* Toast */}
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
        <div className="flex items-center gap-3 mb-4">
          <button onClick={onBack} className="w-8 h-8 flex items-center justify-center rounded-xl bg-white/10 active:scale-90 transition-transform">
            <ArrowLeft className="w-4 h-4 text-white" />
          </button>
          <div className="flex-1">
            <h1 className="text-white font-bold text-base">DTR Management</h1>
            <p className="text-white/40 text-xs">{isAdmin ? 'All Employees' : 'My Records'}</p>
          </div>
          <button onClick={load} className="w-8 h-8 flex items-center justify-center rounded-xl bg-white/10 active:scale-90 transition-transform">
            <RefreshCw className={`w-4 h-4 text-white ${loading ? 'animate-spin' : ''}`} />
          </button>
          {isAdmin && (
            <button
              onClick={() => { setShowGenerate(true); loadEmployees(); }}
              className="flex items-center gap-1.5 bg-blue-500/20 text-blue-300 border border-blue-400/20 text-xs font-semibold px-3 py-2 rounded-xl active:scale-95 transition-transform"
            >
              <Plus className="w-3.5 h-3.5" />
              Generate
            </button>
          )}
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-4 gap-2 mb-3">
          {[
            { label: 'Total', value: stats.total, color: 'text-white' },
            { label: 'Pending', value: stats.generated, color: 'text-blue-300' },
            { label: 'Acknowledged', value: stats.acknowledged, color: 'text-emerald-300' },
            { label: 'Issues', value: stats.issues, color: 'text-amber-300' },
          ].map(s => (
            <div key={s.label} className="bg-white/5 rounded-xl p-2 text-center border border-white/5">
              <p className={`text-lg font-bold ${s.color}`}>{s.value}</p>
              <p className="text-white/40 text-[10px]">{s.label}</p>
            </div>
          ))}
        </div>

        {/* Search + filter toggle */}
        <div className="flex gap-2">
          <div className="flex-1 flex items-center gap-2 bg-white/5 border border-white/10 rounded-xl px-3 py-2">
            <Search className="w-3.5 h-3.5 text-white/30 shrink-0" />
            <input
              value={filterSearch}
              onChange={e => setFilterSearch(e.target.value)}
              placeholder="Search employee..."
              className="bg-transparent text-white text-xs flex-1 outline-none placeholder-white/30"
            />
            {filterSearch && <button onClick={() => setFilterSearch('')}><X className="w-3.5 h-3.5 text-white/30" /></button>}
          </div>
          <button
            onClick={() => setShowFilters(v => !v)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium border transition-colors ${
              showFilters ? 'bg-blue-500/20 text-blue-300 border-blue-400/20' : 'bg-white/5 text-white/60 border-white/10'
            }`}
          >
            <Filter className="w-3.5 h-3.5" />
            Filter
          </button>
        </div>

        {/* Filter panel */}
        {showFilters && (
          <div className="mt-2 grid grid-cols-2 gap-2">
            <select value={filterStatus} onChange={e => setFilterStatus(e.target.value as DTRStatus | '')}
              className="bg-slate-800 border border-white/10 text-white/70 text-xs rounded-xl px-3 py-2 outline-none">
              <option value="">All Statuses</option>
              {Object.keys(STATUS_STYLE).map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            <select value={filterCutOff} onChange={e => setFilterCutOff(e.target.value as DTRCutOff | '')}
              className="bg-slate-800 border border-white/10 text-white/70 text-xs rounded-xl px-3 py-2 outline-none">
              <option value="">All Cut-Offs</option>
              <option value="1st">1st Cut-Off</option>
              <option value="2nd">2nd Cut-Off</option>
            </select>
            <select value={filterMonth} onChange={e => setFilterMonth(e.target.value ? Number(e.target.value) : '')}
              className="bg-slate-800 border border-white/10 text-white/70 text-xs rounded-xl px-3 py-2 outline-none">
              <option value="">All Months</option>
              {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
            </select>
            <select value={filterYear} onChange={e => setFilterYear(e.target.value ? Number(e.target.value) : '')}
              className="bg-slate-800 border border-white/10 text-white/70 text-xs rounded-xl px-3 py-2 outline-none">
              <option value="">All Years</option>
              {yearOptions.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
        )}
      </div>

      {/* List */}
      <div className="flex-1 px-4 pt-4 space-y-3">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <Loader2 className="w-8 h-8 text-blue-400 animate-spin" />
            <p className="text-white/40 text-sm">Loading DTR records...</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <FileText className="w-12 h-12 text-white/10" />
            <p className="text-white/40 text-sm">No DTR records found</p>
            {isAdmin && (
              <button onClick={() => { setShowGenerate(true); loadEmployees(); }}
                className="flex items-center gap-2 bg-blue-500/20 text-blue-300 border border-blue-400/20 text-sm font-medium px-4 py-2 rounded-xl active:scale-95 transition-transform">
                <Plus className="w-4 h-4" />
                Generate First DTR
              </button>
            )}
          </div>
        ) : filtered.map((r) => (
          <div key={r.id} className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden">
            {/* Card header */}
            <div className="px-4 pt-4 pb-3">
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center shrink-0">
                  <FileText className="w-4.5 h-4.5 text-white" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-white font-semibold text-sm truncate">{r.employeeName}</p>
                  <p className="text-white/40 text-xs truncate">{r.employeeEmail}</p>
                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    {r.department && (
                      <span className="flex items-center gap-1 text-white/40 text-[10px]">
                        <Building2 className="w-2.5 h-2.5" />{r.department}
                      </span>
                    )}
                    {r.designation && (
                      <span className="flex items-center gap-1 text-white/40 text-[10px]">
                        <Briefcase className="w-2.5 h-2.5" />{r.designation}
                      </span>
                    )}
                  </div>
                </div>
                <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${STATUS_STYLE[r.status] || 'bg-white/10 text-white/50 border-white/10'}`}>
                  {r.status}
                </span>
              </div>
            </div>

            {/* Cut-off info */}
            <div className="px-4 pb-3 space-y-1.5 border-t border-white/5 pt-3">
              <div className="flex items-center gap-2">
                <Calendar className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                <span className="text-white/70 text-xs">{cutOffLabel(r.month, r.year, r.cutOff)}</span>
              </div>
              <div className="flex items-center gap-2">
                <Clock className="w-3.5 h-3.5 text-white/30 shrink-0" />
                <span className="text-white/40 text-xs">Generated {fmtDate(r.generatedAt)}</span>
              </div>
              {r.acknowledgedAt && (
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                  <span className="text-emerald-400/70 text-xs">Acknowledged {fmtDate(r.acknowledgedAt)}</span>
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="px-4 pb-4 flex gap-2 flex-wrap">
              <button
                onClick={() => handleViewFull(r.id)}
                disabled={actingId === r.id}
                className="flex items-center gap-1.5 bg-blue-500/15 text-blue-300 border border-blue-400/20 text-xs font-medium px-3 py-2 rounded-xl active:scale-95 transition-transform disabled:opacity-50"
              >
                {actingId === r.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Eye className="w-3.5 h-3.5" />}
                View
              </button>
              {isAdmin && r.status !== 'Acknowledged' && (
                <button
                  onClick={() => handleRegenerate(r.id)}
                  disabled={actingId === r.id}
                  className="flex items-center gap-1.5 bg-orange-500/15 text-orange-300 border border-orange-400/20 text-xs font-medium px-3 py-2 rounded-xl active:scale-95 transition-transform disabled:opacity-50"
                >
                  {actingId === r.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RotateCcw className="w-3.5 h-3.5" />}
                  Regenerate
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Generate Modal */}
      {showGenerate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm px-4" onClick={e => { if (e.target === e.currentTarget) setShowGenerate(false); }}>
          <div className="w-full max-w-sm bg-slate-900 border border-white/10 rounded-3xl px-5 pt-5 pb-6 space-y-4 shadow-2xl">
            {/* Header */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-blue-500/20 flex items-center justify-center">
                  <FileText className="w-4 h-4 text-blue-300" />
                </div>
                <h2 className="text-white font-bold text-base">Generate DTR</h2>
              </div>
              <button onClick={() => setShowGenerate(false)} className="w-8 h-8 flex items-center justify-center rounded-xl bg-white/10 active:scale-90 transition-transform">
                <X className="w-4 h-4 text-white" />
              </button>
            </div>

            <div className="space-y-3">
              {/* Month + Year */}
              <div className="grid grid-cols-2 gap-3">
                <SelectField<number> label="Month" value={genMonth} onChange={setGenMonth}>
                  {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
                </SelectField>
                <SelectField<number> label="Year" value={genYear} onChange={setGenYear}>
                  {yearOptions.map(y => <option key={y} value={y}>{y}</option>)}
                </SelectField>
              </div>

              {/* Cut-off */}
              <div>
                <label className="text-white/50 text-xs mb-1.5 block">Payroll Cut-Off</label>
                <div className="grid grid-cols-2 gap-2">
                  {(['1st', '2nd'] as DTRCutOff[]).map(c => (
                    <button key={c} type="button" onClick={() => setGenCutOff(c)}
                      className={`py-2.5 rounded-xl text-sm font-medium border transition-colors ${
                        genCutOff === c ? 'bg-blue-500/20 text-blue-300 border-blue-400/30' : 'bg-slate-800 text-white/60 border-white/10 hover:border-white/20'
                      }`}
                    >
                      {c} Cut-Off
                    </button>
                  ))}
                </div>
                <p className="text-white/30 text-xs mt-1.5">
                  📅 Coverage: <span className="text-white/50">{MONTHS[genMonth - 1]} {genCutOff === '1st' ? `1–15` : `16–${new Date(genYear, genMonth, 0).getDate()}`}, {genYear}</span>
                </p>
              </div>

              {/* Employee */}
              <div>
                <label className="text-white/50 text-xs mb-1.5 block">Employee</label>
                {empLoading ? (
                  <div className="flex items-center gap-2 bg-slate-800 border border-white/10 rounded-xl px-3 py-3">
                    <Loader2 className="w-4 h-4 text-white/30 animate-spin" />
                    <span className="text-white/30 text-sm">Loading employees…</span>
                  </div>
                ) : (
                  <EmployeeSelect
                    value={genEmpEmail}
                    employees={employees}
                    onChange={(email) => setGenEmpEmail(email)}
                  />
                )}
              </div>
            </div>

            <button
              onClick={handleGenerate}
              disabled={generating || !genEmpEmail}
              className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-500 text-white font-semibold text-sm py-3 rounded-xl disabled:opacity-50 active:scale-[0.98] transition-all"
            >
              {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}
              {generating ? 'Generating…' : 'Generate DTR'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
