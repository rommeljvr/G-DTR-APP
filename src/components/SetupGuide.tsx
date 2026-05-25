import { useState } from 'react';
import { APPS_SCRIPT_TEMPLATE } from '../utils/sheets';
import {
  ArrowLeft,
  ArrowRight,
  Copy,
  Check,
  ExternalLink,
  FileSpreadsheet,
  Code,
  Rocket,
  Link2,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';

interface Props {
  onBack: () => void;
  onComplete: (url: string) => void;
}

const steps = [
  {
    id: 1,
    title: 'Create Google Sheet',
    icon: FileSpreadsheet,
    color: 'from-green-500 to-emerald-600',
  },
  {
    id: 2,
    title: 'Open Apps Script',
    icon: Code,
    color: 'from-blue-500 to-indigo-600',
  },
  {
    id: 3,
    title: 'Paste & Save Code',
    icon: Copy,
    color: 'from-purple-500 to-violet-600',
  },
  {
    id: 4,
    title: 'Deploy Web App',
    icon: Rocket,
    color: 'from-orange-500 to-red-600',
  },
  {
    id: 5,
    title: 'Copy & Connect',
    icon: Link2,
    color: 'from-pink-500 to-rose-600',
  },
];

export default function SetupGuide({ onBack, onComplete }: Props) {
  const [currentStep, setCurrentStep] = useState(1);
  const [copied, setCopied] = useState(false);
  const [scriptUrl, setScriptUrl] = useState('');
  const [showCode, setShowCode] = useState(false);

  const handleCopyScript = async () => {
    try {
      await navigator.clipboard.writeText(APPS_SCRIPT_TEMPLATE);
      setCopied(true);
      setTimeout(() => setCopied(false), 3000);
    } catch {
      const textarea = document.createElement('textarea');
      textarea.value = APPS_SCRIPT_TEMPLATE;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      setCopied(true);
      setTimeout(() => setCopied(false), 3000);
    }
  };

  const handleComplete = () => {
    if (scriptUrl.trim()) {
      onComplete(scriptUrl.trim());
    }
  };

  const nextStep = () => {
    if (currentStep < 5) setCurrentStep(currentStep + 1);
  };

  const prevStep = () => {
    if (currentStep > 1) setCurrentStep(currentStep - 1);
  };

  return (
    <div className="min-h-dvh flex flex-col">
      {/* Header */}
      <div className="bg-gradient-to-r from-blue-800 to-blue-900 px-4 pt-4 pb-5">
        <div className="flex items-center gap-3 mb-4">
          <button
            onClick={onBack}
            className="w-9 h-9 bg-white/10 rounded-full flex items-center justify-center text-white active:scale-90 transition-transform"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-white font-bold text-lg">Google Sheets Setup</h1>
            <p className="text-blue-200/60 text-xs">Step {currentStep} of 5</p>
          </div>
        </div>

        {/* Progress Steps */}
        <div className="flex items-center justify-between">
          {steps.map((step, idx) => (
            <div key={step.id} className="flex items-center">
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
                  currentStep > step.id
                    ? 'bg-green-500 text-white'
                    : currentStep === step.id
                    ? 'bg-white text-blue-800'
                    : 'bg-white/20 text-white/50'
                }`}
              >
                {currentStep > step.id ? (
                  <Check className="w-4 h-4" />
                ) : (
                  step.id
                )}
              </div>
              {idx < steps.length - 1 && (
                <div
                  className={`w-6 h-0.5 mx-1 ${
                    currentStep > step.id ? 'bg-green-500' : 'bg-white/20'
                  }`}
                />
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 px-4 py-6 overflow-auto">
        {/* Step 1 */}
        {currentStep === 1 && (
          <div className="slide-up space-y-4">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-12 h-12 bg-gradient-to-br from-green-500 to-emerald-600 rounded-xl flex items-center justify-center">
                <FileSpreadsheet className="w-6 h-6 text-white" />
              </div>
              <div>
                <h2 className="text-white font-bold text-xl">Create Google Sheet</h2>
                <p className="text-blue-200/60 text-sm">Your attendance database</p>
              </div>
            </div>

            <div className="bg-white/10 backdrop-blur-xl rounded-2xl p-4 border border-white/10 space-y-4">
              <div className="flex items-start gap-3">
                <div className="w-7 h-7 bg-green-500/20 rounded-full flex items-center justify-center shrink-0 mt-0.5">
                  <span className="text-green-400 text-sm font-bold">1</span>
                </div>
                <div>
                  <p className="text-white font-medium text-sm">Go to Google Sheets</p>
                  <p className="text-blue-200/60 text-xs mt-0.5">Open sheets.google.com in your browser</p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="w-7 h-7 bg-green-500/20 rounded-full flex items-center justify-center shrink-0 mt-0.5">
                  <span className="text-green-400 text-sm font-bold">2</span>
                </div>
                <div>
                  <p className="text-white font-medium text-sm">Create a Blank Spreadsheet</p>
                  <p className="text-blue-200/60 text-xs mt-0.5">Click the "+" button or "Blank" template</p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="w-7 h-7 bg-green-500/20 rounded-full flex items-center justify-center shrink-0 mt-0.5">
                  <span className="text-green-400 text-sm font-bold">3</span>
                </div>
                <div>
                  <p className="text-white font-medium text-sm">Name Your Spreadsheet</p>
                  <p className="text-blue-200/60 text-xs mt-0.5">Example: "DTR Attendance System"</p>
                </div>
              </div>
            </div>

            <a
              href="https://sheets.google.com"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 bg-gradient-to-r from-green-500 to-emerald-600 text-white font-semibold py-3.5 rounded-xl active:scale-95 transition-transform"
            >
              <ExternalLink className="w-4 h-4" />
              Open Google Sheets
            </a>
          </div>
        )}

        {/* Step 2 */}
        {currentStep === 2 && (
          <div className="slide-up space-y-4">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-xl flex items-center justify-center">
                <Code className="w-6 h-6 text-white" />
              </div>
              <div>
                <h2 className="text-white font-bold text-xl">Open Apps Script</h2>
                <p className="text-blue-200/60 text-sm">Access the script editor</p>
              </div>
            </div>

            <div className="bg-white/10 backdrop-blur-xl rounded-2xl p-4 border border-white/10 space-y-4">
              <div className="flex items-start gap-3">
                <div className="w-7 h-7 bg-blue-500/20 rounded-full flex items-center justify-center shrink-0 mt-0.5">
                  <span className="text-blue-400 text-sm font-bold">1</span>
                </div>
                <div>
                  <p className="text-white font-medium text-sm">Open Your Spreadsheet</p>
                  <p className="text-blue-200/60 text-xs mt-0.5">The one you just created</p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="w-7 h-7 bg-blue-500/20 rounded-full flex items-center justify-center shrink-0 mt-0.5">
                  <span className="text-blue-400 text-sm font-bold">2</span>
                </div>
                <div>
                  <p className="text-white font-medium text-sm">Click "Extensions" Menu</p>
                  <p className="text-blue-200/60 text-xs mt-0.5">Located in the top menu bar</p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="w-7 h-7 bg-blue-500/20 rounded-full flex items-center justify-center shrink-0 mt-0.5">
                  <span className="text-blue-400 text-sm font-bold">3</span>
                </div>
                <div>
                  <p className="text-white font-medium text-sm">Select "Apps Script"</p>
                  <p className="text-blue-200/60 text-xs mt-0.5">This opens the script editor in a new tab</p>
                </div>
              </div>
            </div>

            <div className="bg-blue-500/10 border border-blue-400/20 rounded-xl p-4">
              <p className="text-blue-200 text-xs leading-relaxed">
                💡 <strong>Tip:</strong> The Apps Script editor will open in a new browser tab. It may show a default "myFunction" code - you'll replace this in the next step.
              </p>
            </div>
          </div>
        )}

        {/* Step 3 */}
        {currentStep === 3 && (
          <div className="slide-up space-y-4">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-12 h-12 bg-gradient-to-br from-purple-500 to-violet-600 rounded-xl flex items-center justify-center">
                <Copy className="w-6 h-6 text-white" />
              </div>
              <div>
                <h2 className="text-white font-bold text-xl">Paste & Save Code</h2>
                <p className="text-blue-200/60 text-sm">Add the DTR backend code</p>
              </div>
            </div>

            <div className="bg-white/10 backdrop-blur-xl rounded-2xl p-4 border border-white/10 space-y-4">
              <div className="flex items-start gap-3">
                <div className="w-7 h-7 bg-purple-500/20 rounded-full flex items-center justify-center shrink-0 mt-0.5">
                  <span className="text-purple-400 text-sm font-bold">1</span>
                </div>
                <div>
                  <p className="text-white font-medium text-sm">Copy the Script Code</p>
                  <p className="text-blue-200/60 text-xs mt-0.5">Click the button below to copy</p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="w-7 h-7 bg-purple-500/20 rounded-full flex items-center justify-center shrink-0 mt-0.5">
                  <span className="text-purple-400 text-sm font-bold">2</span>
                </div>
                <div>
                  <p className="text-white font-medium text-sm">Delete Existing Code</p>
                  <p className="text-blue-200/60 text-xs mt-0.5">Select all (Ctrl+A) and delete in the editor</p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="w-7 h-7 bg-purple-500/20 rounded-full flex items-center justify-center shrink-0 mt-0.5">
                  <span className="text-purple-400 text-sm font-bold">3</span>
                </div>
                <div>
                  <p className="text-white font-medium text-sm">Paste the Code (Ctrl+V)</p>
                  <p className="text-blue-200/60 text-xs mt-0.5">Paste the copied code into the editor</p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="w-7 h-7 bg-purple-500/20 rounded-full flex items-center justify-center shrink-0 mt-0.5">
                  <span className="text-purple-400 text-sm font-bold">4</span>
                </div>
                <div>
                  <p className="text-white font-medium text-sm">Save the Project</p>
                  <p className="text-blue-200/60 text-xs mt-0.5">Press Ctrl+S or click the save icon 💾</p>
                </div>
              </div>
            </div>

            <button
              onClick={handleCopyScript}
              className={`w-full flex items-center justify-center gap-2 font-semibold py-3.5 rounded-xl active:scale-95 transition-all ${
                copied
                  ? 'bg-green-500 text-white'
                  : 'bg-gradient-to-r from-purple-500 to-violet-600 text-white'
              }`}
            >
              {copied ? (
                <>
                  <Check className="w-5 h-5" />
                  Code Copied!
                </>
              ) : (
                <>
                  <Copy className="w-5 h-5" />
                  Copy Script Code
                </>
              )}
            </button>

            {/* Expandable Code Preview */}
            <button
              onClick={() => setShowCode(!showCode)}
              className="w-full flex items-center justify-between bg-white/5 text-white/70 py-3 px-4 rounded-xl text-sm"
            >
              <span>View Code Preview</span>
              {showCode ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>

            {showCode && (
              <div className="bg-black/40 rounded-xl p-3 max-h-60 overflow-auto">
                <pre className="text-green-300/80 text-[9px] leading-relaxed whitespace-pre-wrap font-mono">
                  {APPS_SCRIPT_TEMPLATE}
                </pre>
              </div>
            )}
          </div>
        )}

        {/* Step 4 */}
        {currentStep === 4 && (
          <div className="slide-up space-y-4">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-12 h-12 bg-gradient-to-br from-orange-500 to-red-600 rounded-xl flex items-center justify-center">
                <Rocket className="w-6 h-6 text-white" />
              </div>
              <div>
                <h2 className="text-white font-bold text-xl">Deploy Web App</h2>
                <p className="text-blue-200/60 text-sm">Make your API accessible</p>
              </div>
            </div>

            <div className="bg-white/10 backdrop-blur-xl rounded-2xl p-4 border border-white/10 space-y-4">
              <div className="flex items-start gap-3">
                <div className="w-7 h-7 bg-orange-500/20 rounded-full flex items-center justify-center shrink-0 mt-0.5">
                  <span className="text-orange-400 text-sm font-bold">1</span>
                </div>
                <div>
                  <p className="text-white font-medium text-sm">Click "Deploy" Button</p>
                  <p className="text-blue-200/60 text-xs mt-0.5">Blue button in the top-right corner</p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="w-7 h-7 bg-orange-500/20 rounded-full flex items-center justify-center shrink-0 mt-0.5">
                  <span className="text-orange-400 text-sm font-bold">2</span>
                </div>
                <div>
                  <p className="text-white font-medium text-sm">Select "New Deployment"</p>
                  <p className="text-blue-200/60 text-xs mt-0.5">From the dropdown menu</p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="w-7 h-7 bg-orange-500/20 rounded-full flex items-center justify-center shrink-0 mt-0.5">
                  <span className="text-orange-400 text-sm font-bold">3</span>
                </div>
                <div>
                  <p className="text-white font-medium text-sm">Click the Gear ⚙️ Icon</p>
                  <p className="text-blue-200/60 text-xs mt-0.5">Then select "Web app"</p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="w-7 h-7 bg-orange-500/20 rounded-full flex items-center justify-center shrink-0 mt-0.5">
                  <span className="text-orange-400 text-sm font-bold">4</span>
                </div>
                <div>
                  <p className="text-white font-medium text-sm">Configure Settings:</p>
                  <div className="mt-2 space-y-1.5">
                    <div className="bg-orange-500/10 rounded-lg px-3 py-2">
                      <p className="text-orange-300 text-xs">
                        <strong>Execute as:</strong> Me (your email)
                      </p>
                    </div>
                    <div className="bg-orange-500/10 rounded-lg px-3 py-2">
                      <p className="text-orange-300 text-xs">
                        <strong>Who has access:</strong> Anyone
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="w-7 h-7 bg-orange-500/20 rounded-full flex items-center justify-center shrink-0 mt-0.5">
                  <span className="text-orange-400 text-sm font-bold">5</span>
                </div>
                <div>
                  <p className="text-white font-medium text-sm">Click "Deploy"</p>
                  <p className="text-blue-200/60 text-xs mt-0.5">Authorize if prompted (click "Allow")</p>
                </div>
              </div>
            </div>

            <div className="bg-yellow-500/10 border border-yellow-400/20 rounded-xl p-4">
              <p className="text-yellow-200 text-xs leading-relaxed">
                ⚠️ <strong>Authorization:</strong> Google will ask you to authorize the app. Click "Advanced" → "Go to [Project Name] (unsafe)" → "Allow". This is safe as it's your own script.
              </p>
            </div>
          </div>
        )}

        {/* Step 5 */}
        {currentStep === 5 && (
          <div className="slide-up space-y-4">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-12 h-12 bg-gradient-to-br from-pink-500 to-rose-600 rounded-xl flex items-center justify-center">
                <Link2 className="w-6 h-6 text-white" />
              </div>
              <div>
                <h2 className="text-white font-bold text-xl">Copy & Connect</h2>
                <p className="text-blue-200/60 text-sm">Link your DTR app</p>
              </div>
            </div>

            <div className="bg-white/10 backdrop-blur-xl rounded-2xl p-4 border border-white/10 space-y-4">
              <div className="flex items-start gap-3">
                <div className="w-7 h-7 bg-pink-500/20 rounded-full flex items-center justify-center shrink-0 mt-0.5">
                  <span className="text-pink-400 text-sm font-bold">1</span>
                </div>
                <div>
                  <p className="text-white font-medium text-sm">Copy the Web App URL</p>
                  <p className="text-blue-200/60 text-xs mt-0.5">After deployment, you'll see a URL starting with "https://script.google.com/macros/s/..."</p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="w-7 h-7 bg-pink-500/20 rounded-full flex items-center justify-center shrink-0 mt-0.5">
                  <span className="text-pink-400 text-sm font-bold">2</span>
                </div>
                <div>
                  <p className="text-white font-medium text-sm">Paste URL Below</p>
                  <p className="text-blue-200/60 text-xs mt-0.5">This connects your DTR app to Google Sheets</p>
                </div>
              </div>
            </div>

            <div>
              <label className="text-white/80 text-xs font-medium mb-2 block">
                Google Apps Script Web App URL
              </label>
              <input
                type="url"
                value={scriptUrl}
                onChange={(e) => setScriptUrl(e.target.value)}
                placeholder="https://script.google.com/macros/s/AKfycb.../exec"
                className="w-full bg-white/10 border border-white/20 rounded-xl py-3.5 px-4 text-white placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-pink-400 focus:border-transparent text-sm"
              />
            </div>

            <button
              onClick={handleComplete}
              disabled={!scriptUrl.trim()}
              className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-pink-500 to-rose-600 text-white font-semibold py-3.5 rounded-xl active:scale-95 transition-transform disabled:opacity-40"
            >
              <CheckCircle2 className="w-5 h-5" />
              Complete Setup
            </button>

            <div className="bg-green-500/10 border border-green-400/20 rounded-xl p-4">
              <p className="text-green-200 text-xs leading-relaxed">
                ✅ <strong>All Done!</strong> Once connected, your attendance records will automatically sync to your Google Spreadsheet. Records are also saved locally as backup.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Navigation */}
      <div className="px-4 pb-6 flex items-center gap-3">
        {currentStep > 1 && (
          <button
            onClick={prevStep}
            className="flex-1 flex items-center justify-center gap-2 bg-white/10 text-white font-medium py-3 rounded-xl active:scale-95 transition-transform border border-white/10"
          >
            <ArrowLeft className="w-4 h-4" />
            Back
          </button>
        )}
        {currentStep < 5 && (
          <button
            onClick={nextStep}
            className="flex-1 flex items-center justify-center gap-2 bg-gradient-to-r from-blue-500 to-blue-700 text-white font-semibold py-3 rounded-xl active:scale-95 transition-transform"
          >
            Next Step
            <ArrowRight className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );
}
