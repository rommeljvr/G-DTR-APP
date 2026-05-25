import { useState, useEffect } from 'react';
import { User, AttendanceRecord, LocationData } from '../types';
import { getLastAction, getTodayRecords, submitAttendance } from '../utils/sheets';
import { getLocationData } from '../utils/location';
import { getDeviceString } from '../utils/device';
import { createCompositeImage } from '../utils/imageComposite';
import { getConfig } from '../utils/config';
import CameraCapture from './CameraCapture';
import AttendanceHistory from './AttendanceHistory';
import SetupScreen from './SetupScreen';
import DriveImage from './DriveImage';
import {
  LogIn as LogInIcon,
  LogOut as LogOutIcon,
  Clock,
  MapPin,
  Camera,
  History,
  Settings,
  User as UserIcon,
  Loader2,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  ChevronRight,
  Crosshair,
  Building2,
  Image as ImageIcon,
  X,
  Briefcase,
} from 'lucide-react';

interface Props {
  user: User;
  onLogout: () => void;
}

type Tab = 'home' | 'history' | 'setup';

export default function Dashboard({ user, onLogout }: Props) {
  const config = getConfig();
  const emp = user.employee;

  const [activeTab, setActiveTab] = useState<Tab>('home');
  const [lastAction, setLastAction] = useState<AttendanceRecord | null>(null);
  const [todayRecords, setTodayRecords] = useState<AttendanceRecord[]>([]);
  const [showCamera, setShowCamera] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [locationData, setLocationData] = useState<LocationData | null>(null);
  const [locationLoading, setLocationLoading] = useState(false);
  const [locationError, setLocationError] = useState('');
  const [validatingLocation, setValidatingLocation] = useState(false);
  const [notification, setNotification] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);
  const [compositePreview, setCompositePreview] = useState<string | null>(null);
  const [previewPhoto, setPreviewPhoto] = useState<string | null>(null);

  const nextAction: 'TIME_IN' | 'TIME_OUT' =
    lastAction?.action === 'TIME_IN' ? 'TIME_OUT' : 'TIME_IN';

  useEffect(() => {
    loadRecords();
    fetchLocation();
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const loadRecords = () => {
    const last = getLastAction(user.email);
    setLastAction(last);
    setTodayRecords(getTodayRecords(user.email));
  };

  const fetchLocation = async () => {
    setLocationLoading(true);
    setLocationError('');
    try {
      const loc = await getLocationData();
      setLocationData(loc);
    } catch (err: unknown) {
      const message =
        err instanceof GeolocationPositionError
          ? geoMsg(err)
          : 'Unable to get location';
      setLocationError(message);
    } finally {
      setLocationLoading(false);
    }
  };

  const geoMsg = (e: GeolocationPositionError) => {
    switch (e.code) {
      case e.PERMISSION_DENIED:
        return 'Location access denied. Please enable GPS.';
      case e.POSITION_UNAVAILABLE:
        return 'Location unavailable. Check GPS settings.';
      case e.TIMEOUT:
        return 'Location request timed out. Try again.';
      default:
        return 'Unable to get location.';
    }
  };

  const handleCameraCapture = async (photoDataUrl: string) => {
    setShowCamera(false);
    setProcessing(true);
    setNotification(null);

    try {
      let loc = locationData;
      if (!loc) {
        loc = await getLocationData();
        setLocationData(loc);
      }

      const deviceInfo = getDeviceString();
      const now = new Date();
      const compositePhoto = await createCompositeImage(photoDataUrl, loc, deviceInfo);
      setCompositePreview(compositePhoto);

      const record: Omit<AttendanceRecord, 'id'> = {
        userId: user.id,
        userName: user.name,
        userEmail: user.email,
        action: nextAction,
        timestamp: now.toISOString(),
        date: now.toLocaleDateString('en-US'),
        time: now.toLocaleTimeString('en-US', {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: true,
        }),
        latitude: loc.latitude,
        longitude: loc.longitude,
        accuracy: loc.accuracy,
        address: loc.address,
        photo: compositePhoto,
        deviceInfo,
        department: emp?.department || '',
        designation: emp?.designation || '',
      };

      const result = await submitAttendance(record);

      if (result.success) {
        let driveMsg = '';
        if (result.imageId) {
          driveMsg = '\n📷 Photo saved to Drive';
        } else if (result.imageUrl && result.imageUrl.includes('UPLOAD_ERROR')) {
          driveMsg = '\n⚠️ Photo upload failed (see console)';
          console.error('Drive upload error:', result.imageUrl);
        }
        setNotification({
          type: 'success',
          message: `${nextAction === 'TIME_IN' ? 'Time In' : 'Time Out'} recorded!${driveMsg}`,
        });
        loadRecords();
      } else {
        setNotification({ type: 'error', message: result.message });
      }
    } catch (err) {
      console.error('Attendance error:', err);
      setNotification({
        type: 'error',
        message: 'Failed to record attendance. Please try again.',
      });
    } finally {
      setProcessing(false);
    }
  };

  const handleAttendanceAction = async () => {
    // Start location validation
    setValidatingLocation(true);
    setNotification(null);

    try {
      // Check if we have valid location data
      let loc = locationData;
      
      if (!loc) {
        // Try to fetch location
        setNotification({
          type: 'success',
          message: 'Acquiring GPS location...',
        });
        loc = await getLocationData();
        setLocationData(loc);
      }

      // Validate location accuracy (reject if > 100m accuracy)
      if (loc.accuracy > 100) {
        setNotification({
          type: 'error',
          message: `GPS accuracy too low (±${loc.accuracy.toFixed(0)}m). Please move to an open area and try again.`,
        });
        setValidatingLocation(false);
        return;
      }

      // Location validated - proceed to camera
      setValidatingLocation(false);
      setNotification(null);
      setCompositePreview(null);
      setShowCamera(true);
    } catch (err) {
      setValidatingLocation(false);
      const message =
        err instanceof GeolocationPositionError
          ? geoMsg(err)
          : 'Unable to get location. Please enable GPS and try again.';
      setNotification({
        type: 'error',
        message,
      });
    }
  };

  const dismissNotification = () => {
    setNotification(null);
    setCompositePreview(null);
  };

  // ── Sub-screens ──────────────────────────────────────────

  if (showCamera) {
    return (
      <CameraCapture
        onCapture={handleCameraCapture}
        onCancel={() => setShowCamera(false)}
      />
    );
  }

  if (activeTab === 'history') {
    return <AttendanceHistory user={user} onBack={() => setActiveTab('home')} />;
  }

  if (activeTab === 'setup') {
    return <SetupScreen onBack={() => setActiveTab('home')} />;
  }

  // ── Main render ──────────────────────────────────────────

  return (
    <div className="min-h-dvh flex flex-col pb-20">
      {/* Processing overlay */}
      {processing && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center">
          <div className="bg-white/10 backdrop-blur-xl rounded-2xl p-8 mx-6 text-center border border-white/20 slide-up">
            <Loader2 className="w-12 h-12 text-blue-400 animate-spin mx-auto mb-4" />
            <h3 className="text-white font-semibold text-lg mb-1">Processing</h3>
            <p className="text-blue-200/70 text-sm">
              Uploading to Google Drive…
            </p>
          </div>
        </div>
      )}

      {/* Success / Error modal */}
      {notification && !processing && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center px-4">
          <div className="bg-slate-900/95 backdrop-blur-xl rounded-2xl p-6 mx-2 w-full max-w-sm border border-white/10 slide-up max-h-[90dvh] overflow-auto">
            <div className="text-center mb-4">
              {notification.type === 'success' ? (
                <CheckCircle2 className="w-14 h-14 text-green-400 mx-auto mb-3" />
              ) : (
                <XCircle className="w-14 h-14 text-red-400 mx-auto mb-3" />
              )}
              <h3 className="text-white font-bold text-lg mb-1">
                {notification.type === 'success' ? 'Success!' : 'Error'}
              </h3>
              <p className="text-blue-200/70 text-sm whitespace-pre-line">{notification.message}</p>
            </div>

            {compositePreview && notification.type === 'success' && (
              <div className="mb-4 rounded-xl overflow-hidden border border-white/10">
                <img src={compositePreview} alt="Record" className="w-full" />
              </div>
            )}

            <button
              onClick={dismissNotification}
              className="w-full bg-gradient-to-r from-blue-500 to-blue-700 text-white font-semibold py-3 rounded-xl active:scale-95 transition-transform"
            >
              Done
            </button>
          </div>
        </div>
      )}

      {/* Photo preview modal */}
      {previewPhoto && (
        <div className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center px-4">
          <button
            onClick={() => setPreviewPhoto(null)}
            className="absolute top-4 right-4 w-10 h-10 bg-white/10 rounded-full flex items-center justify-center text-white z-10"
          >
            <X className="w-5 h-5" />
          </button>
          <div className="w-full max-w-lg slide-up">
            <img src={previewPhoto} alt="Record" className="w-full rounded-xl" />
          </div>
        </div>
      )}

      {/* ── Header ───────────────────────────────────────── */}
      <div className="bg-gradient-to-br from-blue-800 via-blue-900 to-indigo-900 px-4 pt-3 pb-6">
        {/* Org bar */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-1.5">
            <Building2 className="w-3.5 h-3.5 text-emerald-400" />
            <span className="text-white/90 text-[11px] font-bold tracking-wider uppercase">
              {config.ORGANIZATION}
            </span>
          </div>
          <button
            onClick={onLogout}
            className="text-blue-200/60 hover:text-white text-[11px] flex items-center gap-1 bg-white/10 px-2.5 py-1 rounded-lg active:scale-95 transition-all"
          >
            <LogOutIcon className="w-3 h-3" />
            Logout
          </button>
        </div>

        {/* Employee card */}
        <div className="bg-white/10 backdrop-blur-sm rounded-xl p-3 border border-white/10 mb-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-gradient-to-br from-blue-400 to-blue-600 rounded-full flex items-center justify-center shrink-0">
              <UserIcon className="w-6 h-6 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="text-white font-bold text-sm leading-tight truncate">
                {user.name}
              </h2>
              <p className="text-blue-200/70 text-[11px] truncate">{user.email}</p>
              {emp && (
                <div className="flex items-center gap-2 mt-1">
                  {emp.department && (
                    <span className="text-emerald-400/80 text-[10px] font-medium bg-emerald-500/10 px-1.5 py-0.5 rounded">
                      {emp.department}
                    </span>
                  )}
                  {emp.designation && (
                    <span className="text-blue-300/60 text-[10px] flex items-center gap-0.5">
                      <Briefcase className="w-2.5 h-2.5" />
                      {emp.designation}
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Live clock */}
        <div className="text-center">
          <p className="text-blue-200/60 text-xs mb-1">
            {currentTime.toLocaleDateString('en-US', {
              weekday: 'long',
              month: 'long',
              day: 'numeric',
              year: 'numeric',
            })}
          </p>
          <p className="text-white text-4xl font-bold tracking-wider tabular-nums">
            {currentTime.toLocaleTimeString('en-US', {
              hour: '2-digit',
              minute: '2-digit',
              second: '2-digit',
              hour12: true,
            })}
          </p>
        </div>
      </div>

      {/* ── Content ──────────────────────────────────────── */}
      <div className="flex-1 px-4 -mt-3 space-y-4">
        {/* Status card */}
        <div className="bg-white/10 backdrop-blur-xl rounded-2xl p-4 border border-white/10">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-white/80 text-xs font-medium uppercase tracking-wider">
              Status
            </h3>
            <div
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${
                lastAction?.action === 'TIME_IN'
                  ? 'bg-green-500/20 text-green-300'
                  : 'bg-orange-500/20 text-orange-300'
              }`}
            >
              <div
                className={`w-1.5 h-1.5 rounded-full ${
                  lastAction?.action === 'TIME_IN' ? 'bg-green-400' : 'bg-orange-400'
                }`}
              />
              {lastAction?.action === 'TIME_IN' ? 'Clocked In' : 'Clocked Out'}
            </div>
          </div>

          {lastAction && (
            <div className="flex items-center gap-2 text-blue-200/60 text-xs">
              <Clock className="w-3.5 h-3.5" />
              <span>
                Last: {lastAction.action === 'TIME_IN' ? 'In' : 'Out'} at {lastAction.time} — {lastAction.date}
              </span>
            </div>
          )}
          {!lastAction && (
            <p className="text-blue-200/50 text-xs">No records yet. Start by clocking in!</p>
          )}
        </div>

        {/* Location card */}
        <div className="bg-white/10 backdrop-blur-xl rounded-2xl p-4 border border-white/10">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-white/80 text-xs font-medium uppercase tracking-wider flex items-center gap-1.5">
              <MapPin className="w-3.5 h-3.5 text-blue-400" />
              GPS Location
            </h3>
            <button
              onClick={fetchLocation}
              disabled={locationLoading}
              className="text-blue-400 text-xs flex items-center gap-1 active:scale-95 transition-transform"
            >
              {locationLoading ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Crosshair className="w-3.5 h-3.5" />
              )}
              {locationLoading ? 'Locating...' : 'Refresh'}
            </button>
          </div>

          {locationData && (
            <div className="space-y-1.5">
              <p className="text-white/90 text-xs leading-relaxed">{locationData.address}</p>
              <div className="flex items-center gap-3 text-blue-200/50 text-[11px]">
                <span>📍 {locationData.latitude.toFixed(6)}, {locationData.longitude.toFixed(6)}</span>
                <span>🎯 ±{locationData.accuracy.toFixed(1)}m</span>
              </div>
            </div>
          )}

          {locationError && (
            <div className="flex items-start gap-2 text-orange-300 text-xs">
              <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
              <span>{locationError}</span>
            </div>
          )}

          {locationLoading && !locationData && (
            <div className="flex items-center gap-2 text-blue-200/50 text-xs">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              <span>Acquiring GPS…</span>
            </div>
          )}
        </div>

        {/* ── Main action button ─────────────────────────── */}
        <button
          onClick={handleAttendanceAction}
          disabled={processing || validatingLocation || locationLoading}
          className={`w-full relative overflow-hidden rounded-2xl p-6 text-center active:scale-[0.97] transition-all duration-200 shadow-xl disabled:opacity-60 ${
            nextAction === 'TIME_IN'
              ? 'bg-gradient-to-r from-green-500 to-emerald-600'
              : 'bg-gradient-to-r from-orange-500 to-red-500'
          }`}
        >
          <div className="flex items-center justify-center gap-3">
            <div className="w-14 h-14 bg-white/20 rounded-full flex items-center justify-center">
              {validatingLocation || locationLoading ? (
                <Loader2 className="w-7 h-7 text-white animate-spin" />
              ) : nextAction === 'TIME_IN' ? (
                <LogInIcon className="w-7 h-7 text-white" />
              ) : (
                <LogOutIcon className="w-7 h-7 text-white" />
              )}
            </div>
            <div className="text-left">
              <p className="text-white/80 text-xs font-medium">
                {validatingLocation ? 'Validating GPS...' : locationLoading ? 'Acquiring GPS...' : 'Tap to Record'}
              </p>
              <p className="text-white text-2xl font-bold">
                {nextAction === 'TIME_IN' ? 'TIME IN' : 'TIME OUT'}
              </p>
            </div>
            <ChevronRight className="w-6 h-6 text-white/60 ml-auto" />
          </div>
          <div className="flex items-center justify-center gap-2 mt-3 text-white/70 text-xs">
            <Camera className="w-3.5 h-3.5" />
            <span>
              {validatingLocation ? 'Checking location accuracy...' : 'Photo + GPS capture required'}
            </span>
          </div>
        </button>

        {/* ── Today's log with thumbnails ────────────────── */}
        <div className="bg-white/10 backdrop-blur-xl rounded-2xl p-4 border border-white/10">
          <h3 className="text-white/80 text-xs font-medium uppercase tracking-wider mb-3">
            Today's Log
          </h3>

          {todayRecords.length === 0 ? (
            <p className="text-blue-200/40 text-xs text-center py-3">No records for today</p>
          ) : (
            <div className="space-y-2">
              {todayRecords.map((record, idx) => (
                <div
                  key={idx}
                  className="flex items-center gap-3 bg-white/5 rounded-xl px-3 py-2.5"
                >
                  {(record.photo || record.imageId) ? (
                    <DriveImage
                      photo={record.photo}
                      imageId={record.imageId}
                      thumbnail
                      className="w-11 h-11 rounded-lg overflow-hidden shrink-0 border border-white/10"
                      onClick={(src) => setPreviewPhoto(src)}
                    />
                  ) : (
                    <div
                      className={`w-11 h-11 rounded-lg flex items-center justify-center shrink-0 ${
                        record.action === 'TIME_IN'
                          ? 'bg-green-500/20 text-green-400'
                          : 'bg-orange-500/20 text-orange-400'
                      }`}
                    >
                      {record.action === 'TIME_IN' ? (
                        <LogInIcon className="w-5 h-5" />
                      ) : (
                        <LogOutIcon className="w-5 h-5" />
                      )}
                    </div>
                  )}

                  <div className="flex-1 min-w-0">
                    <p className="text-white text-sm font-medium">
                      {record.action === 'TIME_IN' ? 'Time In' : 'Time Out'}
                    </p>
                    <p className="text-blue-200/50 text-[11px]">{record.time}</p>
                  </div>

                  <div className="text-right flex flex-col items-end gap-0.5">
                    <p className="text-blue-200/40 text-[10px]">
                      ±{record.accuracy?.toFixed(0) || '?'}m
                    </p>
                    {(record.photo || record.imageId) && (
                      <ImageIcon className="w-3 h-3 text-blue-400/40" />
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Bottom nav ───────────────────────────────────── */}
      <div className="fixed bottom-0 left-0 right-0 bg-slate-900/95 backdrop-blur-xl border-t border-white/10">
        <div className="flex items-center justify-around py-2 pb-3 max-w-lg mx-auto">
          {(
            [
              { id: 'home' as Tab, icon: Clock, label: 'Home' },
              { id: 'history' as Tab, icon: History, label: 'History' },
              { id: 'setup' as Tab, icon: Settings, label: 'Settings' },
            ] as const
          ).map(({ id, icon: Icon, label }) => (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              className={`flex flex-col items-center gap-0.5 px-4 py-1.5 rounded-xl transition-all active:scale-90 ${
                activeTab === id ? 'text-blue-400' : 'text-white/40'
              }`}
            >
              <Icon className="w-5 h-5" />
              <span className="text-[10px] font-medium">{label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
