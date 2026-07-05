import { useState, useEffect } from 'react';
import { ArrowLeft, Save, Loader2, CheckCircle2, AlertCircle, UtensilsCrossed, ToggleLeft, ToggleRight, Clock } from 'lucide-react';
import { MealAllowanceConfig } from '../types';
import { saveMealAllowanceSettings } from '../utils/sheets';
import { getScriptUrl } from '../utils/config';

interface Props {
  adminEmail: string;
  onBack: () => void;
}

const DEFAULT_CONFIG: MealAllowanceConfig = {
  enabled: true,
  secondEnabled: true,
  minHours1: 0,
  minHours2: 8,
  maxCount: 2,
};

export default function MealAllowanceSettings({ adminEmail, onBack }: Props) {
  const [config, setConfig] = useState<MealAllowanceConfig>(DEFAULT_CONFIG);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);

  const showToast = (type: 'success' | 'error', msg: string) => {
    setToast({ type, msg });
    setTimeout(() => setToast(null), 3500);
  };

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const scriptUrl = getScriptUrl();
        if (scriptUrl) {
          const res = await fetch(`${scriptUrl}?action=getMealAllowanceConfig`, { method: 'GET', redirect: 'follow' });
          const json = await res.json();
          if (json.success && json.config) setConfig(json.config);
        }
      } catch {
        // use defaults
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const handleSave = async () => {
    setSaving(true);
    const res = await saveMealAllowanceSettings(config, adminEmail);
    setSaving(false);
    if (res.success) {
      if (res.config) setConfig(res.config);
      showToast('success', 'Settings saved successfully.');
    } else {
      showToast('error', res.message || 'Failed to save settings.');
    }
  };

  const Toggle = ({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) => (
    <button
      onClick={() => onChange(!value)}
      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border transition-colors ${
        value
          ? 'bg-emerald-500/20 text-emerald-300 border-emerald-400/25'
          : 'bg-white/5 text-white/40 border-white/10'
      }`}
    >
      {value ? <ToggleRight className="w-4 h-4" /> : <ToggleLeft className="w-4 h-4" />}
      {value ? 'Enabled' : 'Disabled'}
    </button>
  );

  return (
    <div className="min-h-dvh bg-gradient-to-br from-slate-900 via-violet-950 to-slate-900 flex flex-col pb-20">
      {/* Toast */}
      {toast && (
        <div className={`fixed top-4 left-4 right-4 z-50 rounded-xl px-4 py-3 text-sm font-medium text-white shadow-2xl border flex items-center gap-2 ${
          toast.type === 'success' ? 'bg-emerald-600/90 border-emerald-400/30' : 'bg-red-600/90 border-red-400/30'
        }`}>
          {toast.type === 'success'
            ? <CheckCircle2 className="w-4 h-4 shrink-0" />
            : <AlertCircle className="w-4 h-4 shrink-0" />}
          {toast.msg}
        </div>
      )}

      {/* Header */}
      <div className="bg-slate-900/80 backdrop-blur-xl border-b border-white/10 px-4 pt-12 pb-4 sticky top-0 z-30">
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="w-8 h-8 flex items-center justify-center rounded-xl bg-white/10 active:scale-90 transition-transform">
            <ArrowLeft className="w-4 h-4 text-white" />
          </button>
          <div className="flex-1">
            <h1 className="text-white font-bold text-base">Meal Allowance Settings</h1>
            <p className="text-white/40 text-xs">Super Admin Configuration</p>
          </div>
          <div className="w-8 h-8 flex items-center justify-center rounded-xl bg-violet-500/20 border border-violet-400/20">
            <UtensilsCrossed className="w-4 h-4 text-violet-300" />
          </div>
        </div>
      </div>

      {loading ? (
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="w-8 h-8 text-violet-400 animate-spin" />
        </div>
      ) : (
        <div className="flex-1 px-4 pt-5 space-y-4">

          {/* Feature Toggle */}
          <div className="bg-white/5 border border-white/10 rounded-2xl p-4 space-y-4">
            <h2 className="text-white/60 text-[11px] font-semibold uppercase tracking-wider">Feature Toggles</h2>

            <div className="flex items-center justify-between">
              <div>
                <p className="text-white text-sm font-medium">Meal Allowance</p>
                <p className="text-white/40 text-xs mt-0.5">Allow employees to claim meal allowance</p>
              </div>
              <Toggle value={config.enabled} onChange={v => setConfig(c => ({ ...c, enabled: v }))} />
            </div>

            <div className={`flex items-center justify-between ${!config.enabled ? 'opacity-40 pointer-events-none' : ''}`}>
              <div>
                <p className="text-white text-sm font-medium">Second Meal Allowance</p>
                <p className="text-white/40 text-xs mt-0.5">Allow a second claim for extended hours</p>
              </div>
              <Toggle value={config.secondEnabled} onChange={v => setConfig(c => ({ ...c, secondEnabled: v }))} />
            </div>
          </div>

          {/* Eligibility */}
          <div className={`bg-white/5 border border-white/10 rounded-2xl p-4 space-y-4 ${!config.enabled ? 'opacity-40 pointer-events-none' : ''}`}>
            <h2 className="text-white/60 text-[11px] font-semibold uppercase tracking-wider">Eligibility Rules</h2>

            <div>
              <label className="text-white/70 text-xs font-medium flex items-center gap-1.5 mb-2">
                <Clock className="w-3.5 h-3.5 text-amber-400" />
                Min. hours worked for 1st Meal Allowance
              </label>
              <div className="flex items-center gap-3">
                <input
                  type="number" min={0} max={24} step={0.5}
                  value={config.minHours1}
                  onChange={e => setConfig(c => ({ ...c, minHours1: parseFloat(e.target.value) || 0 }))}
                  className="w-24 bg-slate-800 border border-white/10 text-white text-sm rounded-xl px-3 py-2 outline-none"
                />
                <span className="text-white/40 text-xs">hours after Time In (0 = immediately)</span>
              </div>
            </div>

            <div className={!config.secondEnabled ? 'opacity-40 pointer-events-none' : ''}>
              <label className="text-white/70 text-xs font-medium flex items-center gap-1.5 mb-2">
                <Clock className="w-3.5 h-3.5 text-violet-400" />
                Min. hours worked for 2nd Meal Allowance
              </label>
              <div className="flex items-center gap-3">
                <input
                  type="number" min={0} max={24} step={0.5}
                  value={config.minHours2}
                  onChange={e => setConfig(c => ({ ...c, minHours2: parseFloat(e.target.value) || 8 }))}
                  className="w-24 bg-slate-800 border border-white/10 text-white text-sm rounded-xl px-3 py-2 outline-none"
                />
                <span className="text-white/40 text-xs">hours after Time In (default: 8h)</span>
              </div>
            </div>

            <div>
              <label className="text-white/70 text-xs font-medium flex items-center gap-1.5 mb-2">
                <UtensilsCrossed className="w-3.5 h-3.5 text-emerald-400" />
                Maximum submissions per attendance
              </label>
              <div className="flex items-center gap-3">
                <input
                  type="number" min={1} max={10} step={1}
                  value={config.maxCount}
                  onChange={e => setConfig(c => ({ ...c, maxCount: parseInt(e.target.value) || 2 }))}
                  className="w-24 bg-slate-800 border border-white/10 text-white text-sm rounded-xl px-3 py-2 outline-none"
                />
                <span className="text-white/40 text-xs">per Time In record (default: 2)</span>
              </div>
            </div>
          </div>

          {/* Summary */}
          <div className="bg-violet-500/8 border border-violet-400/15 rounded-2xl p-4">
            <p className="text-violet-300 text-xs font-semibold mb-2">Current Policy Summary</p>
            <ul className="space-y-1 text-white/50 text-xs">
              <li>• Meal Allowance: <span className={config.enabled ? 'text-emerald-300' : 'text-red-400'}>{config.enabled ? 'Enabled' : 'Disabled'}</span></li>
              <li>• 2nd Meal Allowance: <span className={config.enabled && config.secondEnabled ? 'text-emerald-300' : 'text-red-400'}>{config.enabled && config.secondEnabled ? 'Enabled' : 'Disabled'}</span></li>
              <li>• 1st eligible after: <span className="text-white/80">{config.minHours1 === 0 ? 'immediately after Time In' : `${config.minHours1}h after Time In`}</span></li>
              <li>• 2nd eligible after: <span className="text-white/80">{config.minHours2}h after Time In</span></li>
              <li>• Max per shift: <span className="text-white/80">{config.maxCount} submission{config.maxCount !== 1 ? 's' : ''}</span></li>
            </ul>
          </div>

          {/* Save */}
          <button
            onClick={handleSave}
            disabled={saving}
            className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-violet-500 to-violet-700 text-white font-semibold py-3.5 rounded-2xl active:scale-95 transition-transform disabled:opacity-60"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {saving ? 'Saving…' : 'Save Settings'}
          </button>

        </div>
      )}
    </div>
  );
}
