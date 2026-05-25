import { useState, useEffect } from 'react';
import { getConfig, saveConfig, AppConfig } from '../utils/config';
import { testConnection, APPS_SCRIPT_TEMPLATE } from '../utils/sheets';
import { getDeviceInfo } from '../utils/device';
import SetupGuide from './SetupGuide';
import {
  ArrowLeft,
  Link2,
  Save,
  CheckCircle2,
  Copy,
  Check,
  Smartphone,
  Globe,
  Monitor,
  FileCode,
  ExternalLink,
  Info,
  BookOpen,
  Trash2,
  Wifi,
  WifiOff,
  Loader2,
  Cloud,
  FolderOpen,
  Building2,
  Type,
  Pencil,
} from 'lucide-react';

interface Props {
  onBack: () => void;
}

export default function SetupScreen({ onBack }: Props) {
  const [cfg, setCfg] = useState<AppConfig>(getConfig());
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showScript, setShowScript] = useState(false);
  const [showGuide, setShowGuide] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<
    'idle' | 'testing' | 'success' | 'error'
  >('idle');
  const [editingField, setEditingField] = useState<string | null>(null);

  const deviceInfo = getDeviceInfo();

  useEffect(() => {
    if (cfg.SCRIPT_URL) handleTestConnection();
  }, []);

  const handleTestConnection = async () => {
    setConnectionStatus('testing');
    const result = await testConnection();
    setConnectionStatus(result.success ? 'success' : 'error');
  };

  const updateField = (key: keyof AppConfig, value: string) => {
    setCfg((prev) => ({ ...prev, [key]: value }));
  };

  const handleSaveAll = async () => {
    saveConfig(cfg);
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
    if (cfg.SCRIPT_URL) await handleTestConnection();
  };

  const handleCopyScript = async () => {
    try {
      await navigator.clipboard.writeText(APPS_SCRIPT_TEMPLATE);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = APPS_SCRIPT_TEMPLATE;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 3000);
  };

  const handleGuideComplete = (url: string) => {
    updateField('SCRIPT_URL', url);
    saveConfig({ ...cfg, SCRIPT_URL: url });
    setShowGuide(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
    handleTestConnection();
  };

  const clearAllData = () => {
    if (
      confirm(
        'Are you sure you want to clear all local attendance records? This cannot be undone.',
      )
    ) {
      localStorage.removeItem('dtr_records');
      alert('Local records cleared successfully.');
    }
  };

  if (showGuide) {
    return (
      <SetupGuide onBack={() => setShowGuide(false)} onComplete={handleGuideComplete} />
    );
  }

  // ── Editable row helper ────────────────────────────────
  const SettingRow = ({
    icon: Icon,
    label,
    fieldKey,
    placeholder,
    mono,
  }: {
    icon: typeof FolderOpen;
    label: string;
    fieldKey: keyof AppConfig;
    placeholder: string;
    mono?: boolean;
  }) => {
    const isEditing = editingField === fieldKey;
    return (
      <div className="bg-white/5 rounded-xl px-3 py-2.5 space-y-1.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Icon className="w-3.5 h-3.5 text-blue-400" />
            <span className="text-white/60 text-xs font-medium">{label}</span>
          </div>
          <button
            onClick={() => setEditingField(isEditing ? null : fieldKey)}
            className="text-blue-400 active:scale-90 transition-transform"
          >
            <Pencil className="w-3.5 h-3.5" />
          </button>
        </div>

        {isEditing ? (
          <input
            type="text"
            value={cfg[fieldKey]}
            onChange={(e) => updateField(fieldKey, e.target.value)}
            placeholder={placeholder}
            autoFocus
            className={`w-full bg-white/10 border border-blue-400/40 rounded-lg py-2 px-3 text-white placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-blue-400 text-xs ${mono ? 'font-mono' : ''}`}
          />
        ) : (
          <p
            className={`text-white/90 text-xs truncate ${mono ? 'font-mono' : 'font-medium'}`}
          >
            {cfg[fieldKey] || '—'}
          </p>
        )}
      </div>
    );
  };

  return (
    <div className="min-h-dvh flex flex-col pb-8">
      {/* Header */}
      <div className="bg-gradient-to-r from-blue-800 to-blue-900 px-4 pt-4 pb-5">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="w-9 h-9 bg-white/10 rounded-full flex items-center justify-center text-white active:scale-90 transition-transform"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-white font-bold text-lg">Settings</h1>
            <p className="text-blue-200/60 text-xs">
              Configuration &amp; Google Sheets setup
            </p>
          </div>
        </div>
      </div>

      <div className="flex-1 px-4 mt-4 space-y-4">
        {/* Connection status */}
        <div
          className={`rounded-2xl p-4 flex items-center gap-4 ${
            connectionStatus === 'success'
              ? 'bg-gradient-to-r from-green-500/20 to-emerald-500/20 border border-green-500/30'
              : connectionStatus === 'error'
              ? 'bg-gradient-to-r from-red-500/20 to-orange-500/20 border border-red-500/30'
              : 'bg-gradient-to-r from-blue-500/20 to-indigo-500/20 border border-blue-500/30'
          }`}
        >
          <div
            className={`w-12 h-12 rounded-xl flex items-center justify-center ${
              connectionStatus === 'success'
                ? 'bg-green-500/30'
                : connectionStatus === 'error'
                ? 'bg-red-500/30'
                : 'bg-blue-500/30'
            }`}
          >
            {connectionStatus === 'testing' ? (
              <Loader2 className="w-6 h-6 text-blue-400 animate-spin" />
            ) : connectionStatus === 'success' ? (
              <Cloud className="w-6 h-6 text-green-400" />
            ) : connectionStatus === 'error' ? (
              <WifiOff className="w-6 h-6 text-red-400" />
            ) : (
              <Wifi className="w-6 h-6 text-blue-400" />
            )}
          </div>
          <div className="flex-1">
            <p
              className={`font-bold text-sm ${
                connectionStatus === 'success'
                  ? 'text-green-400'
                  : connectionStatus === 'error'
                  ? 'text-red-400'
                  : 'text-blue-400'
              }`}
            >
              {connectionStatus === 'testing'
                ? 'Testing Connection…'
                : connectionStatus === 'success'
                ? '✓ Connected to Google Sheets'
                : connectionStatus === 'error'
                ? '✗ Connection Failed'
                : 'Google Sheets Backend'}
            </p>
            <p className="text-white/60 text-xs mt-0.5">
              {connectionStatus === 'success'
                ? 'Photos upload to Google Drive automatically'
                : connectionStatus === 'error'
                ? 'Check URL and try again'
                : 'Pre-configured and ready to use'}
            </p>
          </div>
          {connectionStatus !== 'testing' && (
            <button
              onClick={handleTestConnection}
              className="px-3 py-1.5 bg-white/10 rounded-lg text-white/70 text-xs active:scale-95"
            >
              Test
            </button>
          )}
        </div>

        {/* ── Application Settings ───────────────────────── */}
        <div className="bg-white/10 backdrop-blur-xl rounded-2xl p-4 border border-white/10">
          <h3 className="text-white/80 text-xs font-medium uppercase tracking-wider mb-3 flex items-center gap-2">
            <Building2 className="w-4 h-4 text-emerald-400" />
            Application Settings
          </h3>

          <div className="space-y-2">
            <SettingRow
              icon={Type}
              label="APP TITLE"
              fieldKey="APP_TITLE"
              placeholder="Smart DTR System"
            />
            <SettingRow
              icon={Building2}
              label="ORGANIZATION"
              fieldKey="ORGANIZATION"
              placeholder="MIlMetro"
            />
            <SettingRow
              icon={FolderOpen}
              label="GOOGLE DRIVE FOLDER ID"
              fieldKey="FOLDER_ID"
              placeholder="10Qvt5AZuPe..."
              mono
            />
            <SettingRow
              icon={Link2}
              label="APPS SCRIPT URL"
              fieldKey="SCRIPT_URL"
              placeholder="https://script.google.com/macros/s/..."
              mono
            />
          </div>

          <div className="bg-blue-500/10 border border-blue-400/20 rounded-xl px-3 py-2.5 mt-3">
            <div className="flex items-start gap-2">
              <Info className="w-4 h-4 text-blue-400 mt-0.5 shrink-0" />
              <p className="text-blue-200/80 text-[11px] leading-relaxed">
                Tap the <Pencil className="w-3 h-3 inline text-blue-400" /> icon on any
                field to edit. The <strong>Folder ID</strong> is the Google Drive folder
                where attendance photos are saved.
              </p>
            </div>
          </div>

          <button
            onClick={handleSaveAll}
            className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-blue-500 to-blue-700 text-white font-semibold py-3 rounded-xl active:scale-95 transition-transform text-sm mt-3"
          >
            {saved ? (
              <>
                <CheckCircle2 className="w-4 h-4" />
                All Settings Saved!
              </>
            ) : (
              <>
                <Save className="w-4 h-4" />
                Save All Settings
              </>
            )}
          </button>
        </div>

        {/* Step-by-step guide */}
        <button
          onClick={() => setShowGuide(true)}
          className="w-full bg-gradient-to-r from-emerald-500 to-teal-600 rounded-2xl p-4 flex items-center gap-4 active:scale-[0.98] transition-transform"
        >
          <div className="w-12 h-12 bg-white/20 rounded-xl flex items-center justify-center">
            <BookOpen className="w-6 h-6 text-white" />
          </div>
          <div className="flex-1 text-left">
            <p className="text-white font-bold">Step-by-Step Setup Guide</p>
            <p className="text-white/70 text-xs">Create your own Google Sheets backend</p>
          </div>
          <ExternalLink className="w-5 h-5 text-white/60" />
        </button>

        {/* Device info */}
        <div className="bg-white/10 backdrop-blur-xl rounded-2xl p-4 border border-white/10">
          <h3 className="text-white/80 text-xs font-medium uppercase tracking-wider mb-3 flex items-center gap-2">
            <Smartphone className="w-4 h-4 text-blue-400" />
            Device Information
          </h3>
          <div className="space-y-2">
            {[
              { icon: Monitor, label: 'Device Type', value: deviceInfo.deviceType },
              { icon: Globe, label: 'Platform', value: deviceInfo.platform },
              { icon: Monitor, label: 'Screen Size', value: deviceInfo.screenSize },
            ].map(({ icon: Icon, label, value }) => (
              <div
                key={label}
                className="flex items-center justify-between bg-white/5 rounded-lg px-3 py-2"
              >
                <div className="flex items-center gap-2">
                  <Icon className="w-3.5 h-3.5 text-blue-300/50" />
                  <span className="text-white/60 text-xs">{label}</span>
                </div>
                <span className="text-white/90 text-xs font-medium">{value}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Apps Script code */}
        <div className="bg-white/10 backdrop-blur-xl rounded-2xl p-4 border border-white/10">
          <h3 className="text-white/80 text-xs font-medium uppercase tracking-wider mb-3 flex items-center gap-2">
            <FileCode className="w-4 h-4 text-blue-400" />
            Google Apps Script Code
          </h3>

          <p className="text-blue-200/60 text-xs leading-relaxed mb-3">
            This script handles attendance logging and uploads photos to Google Drive.
          </p>

          <div className="flex gap-2">
            <button
              onClick={handleCopyScript}
              className="flex-1 flex items-center justify-center gap-2 bg-white/10 text-white py-2.5 rounded-xl active:scale-95 text-xs font-medium border border-white/10"
            >
              {copied ? (
                <>
                  <Check className="w-3.5 h-3.5 text-green-400" />
                  Copied!
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  Copy Script
                </>
              )}
            </button>
            <button
              onClick={() => setShowScript(!showScript)}
              className="flex-1 flex items-center justify-center gap-2 bg-white/10 text-white py-2.5 rounded-xl active:scale-95 text-xs font-medium border border-white/10"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              {showScript ? 'Hide' : 'View Code'}
            </button>
          </div>

          {showScript && (
            <div className="bg-black/30 rounded-xl p-3 overflow-x-auto max-h-60 mt-3">
              <pre className="text-green-300/80 text-[10px] leading-relaxed whitespace-pre-wrap">
                {APPS_SCRIPT_TEMPLATE}
              </pre>
            </div>
          )}
        </div>

        {/* Data management */}
        <div className="bg-white/10 backdrop-blur-xl rounded-2xl p-4 border border-white/10">
          <h3 className="text-white/80 text-xs font-medium uppercase tracking-wider mb-3 flex items-center gap-2">
            <Trash2 className="w-4 h-4 text-red-400" />
            Data Management
          </h3>
          <button
            onClick={clearAllData}
            className="w-full flex items-center justify-center gap-2 bg-red-500/20 text-red-300 py-2.5 rounded-xl active:scale-95 text-xs font-medium border border-red-500/20"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Clear Local Records
          </button>
          <p className="text-white/30 text-[10px] mt-2 text-center">
            Only clears local data. Google Sheets &amp; Drive records are preserved.
          </p>
        </div>

        {/* About */}
        <div className="bg-white/10 backdrop-blur-xl rounded-2xl p-4 border border-white/10 text-center">
          <p className="text-white/60 text-xs mb-0.5">{cfg.APP_TITLE}</p>
          <p className="text-white/30 text-[10px]">
            {cfg.ORGANIZATION} • v1.0 • Google Sheets + Drive
          </p>
        </div>
      </div>
    </div>
  );
}
