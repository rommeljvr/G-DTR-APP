import { useState } from 'react';
import { User } from '../types';
import { storeUser } from '../utils/auth';
import { validateEmployee } from '../utils/sheets';
import { getConfig } from '../utils/config';
import {
  MapPin,
  Camera,
  Mail,
  LogIn,
  Building2,
  Loader2,
  AlertCircle,
  UserCheck,
  Settings,
} from 'lucide-react';

interface Props {
  onLogin: (user: User) => void;
  onShowSettings: () => void;
}

export default function LoginScreen({ onLogin, onShowSettings }: Props) {
  const [email, setEmail] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const config = getConfig();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!email.trim()) {
      setError('Please enter your email address');
      return;
    }

    if (!email.includes('@')) {
      setError('Please enter a valid email address');
      return;
    }

    setLoading(true);

    try {
      // Validate employee from Google Sheets
      const result = await validateEmployee(email.trim().toLowerCase());

      if (!result.valid || !result.employee) {
        setError(result.message || 'You are not registered as an employee.');
        setLoading(false);
        return;
      }

      // Create user from employee data
      const user: User = {
        email: result.employee.email,
        name: result.employee.name,
        picture: result.employee.image || '',
        id: btoa(result.employee.email),
        employee: result.employee,
      };

      storeUser(user);
      onLogin(user);
    } catch (err) {
      console.error('Login error:', err);
      setError('Unable to connect. Please check your internet connection.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-dvh flex flex-col items-center justify-center px-4 py-8">
      {/* Organization Branding */}
      <div className="text-center mb-8 slide-up">
        {/* Main Logo - Larger */}
        <div className="relative inline-block mb-5">
          <div className="w-32 h-32 bg-white/10 backdrop-blur-sm rounded-3xl p-3 border border-white/20 shadow-2xl">
            <img
              src="/logo.png"
              alt="Organization Logo"
              className="w-full h-full object-contain"
            />
          </div>
        </div>

        {/* Organization Name - Prominent */}
        <div className="mb-3">
          <h1 className="text-3xl font-bold text-white tracking-tight mb-1">
            {config.ORGANIZATION}
          </h1>
          <div className="flex items-center justify-center gap-2">
            <div className="h-px w-8 bg-gradient-to-r from-transparent to-emerald-400/50" />
            <Building2 className="w-4 h-4 text-emerald-400" />
            <div className="h-px w-8 bg-gradient-to-l from-transparent to-emerald-400/50" />
          </div>
        </div>

        {/* App Title & Tagline */}
        <p className="text-xl font-semibold text-white/90">{config.APP_TITLE}</p>
        <p className="text-blue-200/60 text-sm mt-1">Employee Attendance System</p>
      </div>

      {/* Feature cards */}
      <div
        className="grid grid-cols-3 gap-3 mb-8 w-full max-w-sm slide-up"
        style={{ animationDelay: '0.1s' }}
      >
        {[
          { icon: Camera, label: 'Photo Capture', color: 'from-purple-500 to-purple-700' },
          { icon: MapPin, label: 'GPS Location', color: 'from-emerald-500 to-emerald-700' },
          { icon: UserCheck, label: 'Employee ID', color: 'from-orange-500 to-orange-700' },
        ].map(({ icon: Icon, label, color }) => (
          <div
            key={label}
            className="bg-white/10 backdrop-blur-sm rounded-xl p-3 text-center border border-white/10"
          >
            <div
              className={`w-10 h-10 bg-gradient-to-br ${color} rounded-lg flex items-center justify-center mx-auto mb-2`}
            >
              <Icon className="w-5 h-5 text-white" />
            </div>
            <p className="text-white/80 text-[11px] font-medium">{label}</p>
          </div>
        ))}
      </div>

      {/* Login card */}
      <div className="w-full max-w-sm slide-up" style={{ animationDelay: '0.2s' }}>
        <div className="bg-white/10 backdrop-blur-xl rounded-2xl p-6 border border-white/20 shadow-2xl">
          {!showForm ? (
            <>
              <h2 className="text-white text-lg font-semibold text-center mb-2">
                Employee Sign In
              </h2>
              <p className="text-blue-200/60 text-xs text-center mb-5">
                Sign in with your registered company email
              </p>

              <button
                onClick={() => setShowForm(true)}
                className="w-full flex items-center justify-center gap-3 bg-white hover:bg-gray-50 text-gray-800 font-semibold py-3.5 px-6 rounded-xl shadow-lg active:scale-95 transition-all duration-200"
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/>
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                </svg>
                Sign in with Google
              </button>

              <p className="text-blue-200/40 text-[10px] text-center mt-4">
                Only registered employees can access this system
              </p>
            </>
          ) : (
            <>
              <h2 className="text-white text-lg font-semibold text-center mb-1">
                Enter Your Email
              </h2>
              <p className="text-blue-200/70 text-xs text-center mb-5">
                Use your company-registered email address
              </p>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="text-white/70 text-xs font-medium mb-1.5 block">
                    Email Address
                  </label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4.5 h-4.5 text-blue-300/50" />
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="your.email@gmail.com"
                      disabled={loading}
                      className="w-full bg-white/10 border border-white/20 rounded-xl py-3 pl-10 pr-4 text-white placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent text-sm disabled:opacity-50"
                    />
                  </div>
                </div>

                {error && (
                  <div className="bg-red-500/20 border border-red-400/30 rounded-xl px-3 py-2.5 flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 text-red-400 mt-0.5 shrink-0" />
                    <p className="text-red-300 text-xs">{error}</p>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-blue-500 to-blue-700 hover:from-blue-600 hover:to-blue-800 text-white font-semibold py-3.5 px-6 rounded-xl shadow-lg active:scale-95 transition-all duration-200 disabled:opacity-70 disabled:active:scale-100"
                >
                  {loading ? (
                    <>
                      <Loader2 className="w-4.5 h-4.5 animate-spin" />
                      Validating...
                    </>
                  ) : (
                    <>
                      <LogIn className="w-4.5 h-4.5" />
                      Sign In
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setShowForm(false);
                    setError('');
                  }}
                  disabled={loading}
                  className="w-full text-blue-300/70 hover:text-blue-200 text-xs py-2 transition-colors disabled:opacity-50"
                >
                  ← Back
                </button>
              </form>
            </>
          )}
        </div>

        <p className="text-center text-blue-300/40 text-[10px] mt-6">
          🔒 Employee verification via {config.ORGANIZATION} database
        </p>

        {/* Settings access for initial configuration */}
        {/* <button
          onClick={onShowSettings}
          className="mt-4 text-blue-300/50 hover:text-blue-200 text-[10px] flex items-center gap-1 mx-auto transition-colors"
        >
          <Settings className="w-3 h-3" />
          System Configuration
        </button>*/}
      </div>
    </div>
  );
}
