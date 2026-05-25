import { useState, useEffect } from 'react';
import { User } from './types';
import { getStoredUser, clearUser } from './utils/auth';
import { getConfig } from './utils/config';
import LoginScreen from './components/LoginScreen';
import Dashboard from './components/Dashboard';
import SetupScreen from './components/SetupScreen';

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [showSettings, setShowSettings] = useState(false);
  const config = getConfig();

  useEffect(() => {
    const storedUser = getStoredUser();
    if (storedUser) setUser(storedUser);
    setLoading(false);
  }, []);

  const handleLogin = (u: User) => setUser(u);

  const handleLogout = () => {
    clearUser();
    setUser(null);
  };

  const handleSettingsClose = () => setShowSettings(false);

  if (loading) {
    return (
      <div className="min-h-dvh flex items-center justify-center">
        <div className="text-center slide-up">
          <div className="w-16 h-16 bg-gradient-to-br from-blue-400 to-blue-700 rounded-2xl flex items-center justify-center shadow-2xl mx-auto mb-4 animate-pulse">
            <svg
              className="w-8 h-8 text-white"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
          </div>
          <p className="text-white font-semibold text-sm">{config.APP_TITLE}</p>
          <p className="text-white/40 text-xs mt-1">{config.ORGANIZATION}</p>
        </div>
      </div>
    );
  }

  if (showSettings) {
    return <SetupScreen onBack={handleSettingsClose} />;
  }

  if (!user) return <LoginScreen onLogin={handleLogin} onShowSettings={() => setShowSettings(true)} />;

  return <Dashboard user={user} onLogout={handleLogout} />;
}
