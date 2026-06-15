/// <reference path="../pwa.d.ts" />
import { useState, useEffect } from 'react';
import { User, AttendanceRecord, LocationData } from '../types';
import { getLastAction, submitAttendance } from '../utils/sheets';
import { getLocationData, validateAddressCoordinates } from '../utils/location';
import { getDeviceString } from '../utils/device';
import { createCompositeImage } from '../utils/imageComposite';
import { getConfig } from '../utils/config';
import CameraCapture from './CameraCapture';
import AttendanceHistory from './AttendanceHistory';
import SetupScreen from './SetupScreen';
import LeaveApplication from './LeaveApplication';
import LeaveReport from './LeaveReport';
import {
  LogIn as LogInIcon,
  LogOut as LogOutIcon,
  Clock,
  MapPin,
  Camera,
  History,
  Settings,
  FileText,
  User as UserIcon,
  Loader2,
  CheckCircle2,
  XCircle,
  ChevronRight,
  Crosshair,
  Building2,
  X,
  Briefcase,
  MoreVertical,
} from 'lucide-react';

interface Props {
  user: User;
  onLogout: () => void;
  installPrompt?: BeforeInstallPromptEvent | null;
  isInstalled?: boolean;
}

type Tab = 'home' | 'history' | 'leave' | 'leave-report' | 'setup';

export default function Dashboard({ user, onLogout, installPrompt, isInstalled }: Props) {
  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const config = getConfig();
  const emp = user.employee;

  const [activeTab, setActiveTab] = useState<Tab>('home');
  const [lastAction, setLastAction] = useState<AttendanceRecord | null>(null);
  const [showCamera, setShowCamera] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [validatingLocation, setValidatingLocation] = useState(false);
  const [locationValidated, setLocationValidated] = useState(false);
  const [validatedLocation, setValidatedLocation] = useState<LocationData | null>(null);
  const [notification, setNotification] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);
  const [compositePreview, setCompositePreview] = useState<string | null>(null);
  const [previewPhoto, setPreviewPhoto] = useState<string | null>(null);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [isCountingDown, setIsCountingDown] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [shortcutNotice, setShortcutNotice] = useState(false);

  const nextAction: 'TIME_IN' | 'TIME_OUT' =
    lastAction?.action === 'TIME_IN' ? 'TIME_OUT' : 'TIME_IN';

  const formatDisplayDate = (val: string): string => {
    if (!val) return '';
    const isoMatch = val.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (isoMatch) {
      const d = new Date(Number(isoMatch[1]), Number(isoMatch[2]) - 1, Number(isoMatch[3]));
      return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
    }
    const d = new Date(val);
    if (!isNaN(d.getTime())) {
      return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
    }
    return val;
  };

  const formatDisplayTime = (val: string): string => {
    if (!val) return '';
    const isIsoString = /^\d{4}-\d{2}-\d{2}T/.test(val);
    const d = new Date(val);
    if (!isNaN(d.getTime())) {
      const hrs = isIsoString ? d.getUTCHours() : d.getHours();
      const mins = isIsoString ? d.getUTCMinutes() : d.getMinutes();
      const ampm = hrs >= 12 ? 'PM' : 'AM';
      const h = hrs % 12 || 12;
      return `${h}:${mins.toString().padStart(2, '0')} ${ampm}`;
    }
    return val;
  };

  useEffect(() => {
    loadRecords();
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Countdown timer effect
  useEffect(() => {
    if (isCountingDown && countdown !== null && countdown > 0) {
      const timer = setTimeout(() => {
        setCountdown(countdown - 1);
      }, 1000);
      return () => clearTimeout(timer);
    } else if (isCountingDown && countdown === 0) {
      setIsCountingDown(false);
      setCountdown(null);
      // Auto-disable location validation after countdown expires
      setLocationValidated(false);
      setValidatedLocation(null);
      setNotification({
        type: 'error',
        message: 'Countdown expired. Please validate your location again.',
      });
    }
  }, [isCountingDown, countdown]);

  const loadRecords = async () => {
    const last = await getLastAction(user.email);
    setLastAction(last);
  };

  const refreshLocationForValidation = async () => {
    setValidatingLocation(true);
    setNotification({
      type: 'success',
      message: 'Validating GPS location...',
    });

    try {
      let loc = await getLocationData();
      
      // Validate location accuracy (reject if > 100m accuracy)
      if (loc.accuracy > 100) {
        setNotification({
          type: 'error',
          message: `GPS accuracy too low (±${loc.accuracy.toFixed(0)}m). Please move to an open area and try again.`,
        });
        setLocationValidated(false);
        setValidatedLocation(null);
        return;
      }

      // Validate that the address corresponds to the captured coordinates
      const { mismatch, verifiedAddress } = await validateAddressCoordinates(
        loc.latitude,
        loc.longitude,
        loc.address
      );
      if (mismatch) {
        loc = { ...loc, address: verifiedAddress };
        console.warn('[DTR] Address corrected to match coordinates:', verifiedAddress);
      }

      // Location is valid
      setValidatedLocation(loc);
      setLocationValidated(true);
      setNotification({
        type: 'success',
        message: `Location validated! Accuracy: ±${loc.accuracy.toFixed(1)}m`,
      });
      
      // Start 30-second countdown after success message
      setTimeout(() => {
        setIsCountingDown(true);
        setCountdown(30);
      }, 1000); // Start countdown after 1 second delay
    } catch (err) {
      const message =
        err instanceof GeolocationPositionError
          ? geoMsg(err)
          : 'Unable to get location. Please enable GPS and try again.';
      setNotification({
        type: 'error',
        message,
      });
      setLocationValidated(false);
      setValidatedLocation(null);
    } finally {
      setValidatingLocation(false);
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
      // Use the validated location - ensure it's the same for both caption and image
      const loc = validatedLocation;
      if (!loc) {
        throw new Error('No validated location available. Please refresh location first.');
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
        
        // Stop countdown immediately since process completed successfully
        if (isCountingDown) {
          setIsCountingDown(false);
          setCountdown(null);
        }
        
        // Auto-disable location validation to force fresh validation for next transaction
        setLocationValidated(false);
        setValidatedLocation(null);
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
    // Check if location is validated
    if (!locationValidated || !validatedLocation) {
      setNotification({
        type: 'error',
        message: 'Please validate your location first by tapping the refresh button.',
      });
      return;
    }

    // Proceed to camera immediately with validated location
    // Countdown is already running from validation
    setNotification(null);
    setCompositePreview(null);
    setShowCamera(true);
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

  if (activeTab === 'leave') {
    return <LeaveApplication user={user} onBack={() => setActiveTab('home')} onViewReports={() => setActiveTab('leave-report')} />;
  }

  if (activeTab === 'leave-report') {
    return <LeaveReport user={user} onBack={() => setActiveTab('leave')} />;
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

      {/* Add Shortcut / Install modal */}
      {shortcutNotice && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center px-4">
          <div className="bg-slate-900/95 backdrop-blur-xl rounded-2xl p-6 mx-2 w-full max-w-sm border border-white/10 slide-up">
            {isInstalled ? (
              <>
                <div className="text-center mb-5">
                  <CheckCircle2 className="w-14 h-14 text-green-400 mx-auto mb-3" />
                  <h3 className="text-white font-bold text-lg mb-1">Already Installed</h3>
                  <p className="text-blue-200/60 text-sm">This app is already added to your home screen.</p>
                </div>
              </>
            ) : isIOS ? (
              <>
                <div className="text-center mb-4">
                  <div className="w-14 h-14 bg-blue-500/20 rounded-full flex items-center justify-center mx-auto mb-3">
                    <ChevronRight className="w-7 h-7 text-blue-400" />
                  </div>
                  <h3 className="text-white font-bold text-lg mb-1">Add to Home Screen</h3>
                  <p className="text-blue-200/60 text-sm mb-1">Follow these steps in Safari:</p>
                </div>
                <div className="space-y-2 mb-5">
                  <div className="flex items-start gap-3 bg-white/5 rounded-xl px-4 py-3">
                    <span className="text-blue-400 font-bold text-sm mt-0.5">1</span>
                    <p className="text-white/80 text-sm">Tap the <span className="font-bold">Share</span> icon at the bottom of Safari</p>
                  </div>
                  <div className="flex items-start gap-3 bg-white/5 rounded-xl px-4 py-3">
                    <span className="text-blue-400 font-bold text-sm mt-0.5">2</span>
                    <p className="text-white/80 text-sm">Scroll down and tap <span className="font-bold">"Add to Home Screen"</span></p>
                  </div>
                  <div className="flex items-start gap-3 bg-white/5 rounded-xl px-4 py-3">
                    <span className="text-blue-400 font-bold text-sm mt-0.5">3</span>
                    <p className="text-white/80 text-sm">Tap <span className="font-bold">Add</span> to confirm</p>
                  </div>
                </div>
              </>
            ) : (
              <>
                <div className="text-center mb-4">
                  <div className="w-14 h-14 bg-blue-500/20 rounded-full flex items-center justify-center mx-auto mb-3">
                    <ChevronRight className="w-7 h-7 text-blue-400" />
                  </div>
                  <h3 className="text-white font-bold text-lg mb-1">Add Shortcut</h3>
                  <p className="text-blue-200/60 text-sm">Use your browser menu to add this app:</p>
                </div>
                <div className="space-y-2 mb-5">
                  <div className="bg-white/5 rounded-xl px-4 py-3">
                    <p className="text-blue-200/60 text-[11px] font-semibold uppercase tracking-wider mb-1">Android Chrome</p>
                    <p className="text-white/80 text-sm">Tap <span className="font-bold">⋮</span> → <span className="font-bold">"Add to Home screen"</span></p>
                  </div>
                  <div className="bg-white/5 rounded-xl px-4 py-3">
                    <p className="text-blue-200/60 text-[11px] font-semibold uppercase tracking-wider mb-1">Desktop Chrome / Edge</p>
                    <p className="text-white/80 text-sm">Click <span className="font-bold">⋮</span> → <span className="font-bold">"Save and share"</span> → <span className="font-bold">"Create shortcut"</span></p>
                  </div>
                </div>
              </>
            )}
            <button
              onClick={() => setShortcutNotice(false)}
              className="w-full bg-gradient-to-r from-blue-500 to-blue-700 text-white font-semibold py-3 rounded-xl active:scale-95 transition-transform"
            >
              Got it
            </button>
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
      <div className="bg-gradient-to-br from-blue-800 via-blue-900 to-indigo-900 px-4 pt-4 pb-6">
        {/* Organization Branding Bar */}
        <div className="flex items-center justify-between mb-4">
          {/* Logo + Org Name */}
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-white/10 backdrop-blur-sm rounded-xl p-1.5 border border-white/20">
              <img
                src="/logo.png"
                alt="Organization Logo"
                className="w-full h-full object-contain"
              />
            </div>
            <div>
              <h1 className="text-white font-bold text-base leading-tight">
                {config.ORGANIZATION}
              </h1>
              <div className="flex items-center gap-1.5">
                <Building2 className="w-3 h-3 text-emerald-400" />
                <span className="text-emerald-400/90 text-[10px] font-medium">
                  {config.APP_TITLE}
                </span>
              </div>
            </div>
          </div>

          {/* Standardized Logout Button */}
          <button
            onClick={onLogout}
            className="flex items-center gap-2 bg-white/10 hover:bg-white/20 border border-white/20 text-white/90 text-xs font-medium px-3 py-2 rounded-xl active:scale-95 transition-all"
          >
            <LogOutIcon className="w-4 h-4" />
            <span>Logout</span>
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
                Last: {lastAction.action === 'TIME_IN' ? 'In' : 'Out'} at {formatDisplayTime(lastAction.time)} — {formatDisplayDate(lastAction.date)}
              </span>
            </div>
          )}
          {!lastAction && (
            <p className="text-blue-200/50 text-xs">No records yet. Start by clocking in!</p>
          )}
        </div>

        {/* GPS Location Display - Only shown after validation */}
        {locationValidated && validatedLocation && (
          <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-xl p-3 mb-4">
            <div className="flex items-center gap-2 mb-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              <span className="text-emerald-300 text-xs font-medium">Validated Location</span>
            </div>
            <div className="space-y-1.5">
              <p className="text-white/80 text-xs leading-relaxed">{validatedLocation.address}</p>
              <div className="flex items-center gap-3 text-emerald-400/50 text-[11px]">
                <span>📍 {validatedLocation.latitude.toFixed(6)}, {validatedLocation.longitude.toFixed(6)}</span>
                <span>🎯 ±{validatedLocation.accuracy.toFixed(1)}m</span>
              </div>
            </div>
          </div>
        )}

        {/* ── Location validation button ─────────────────── */}
        {!locationValidated && (
          <button
            onClick={refreshLocationForValidation}
            disabled={validatingLocation || processing}
            className="w-full bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/30 rounded-xl p-3 mb-4 active:scale-[0.98] transition-all disabled:opacity-60"
          >
            <div className="flex items-center justify-center gap-2">
              {validatingLocation ? (
                <Loader2 className="w-4 h-4 text-blue-400 animate-spin" />
              ) : (
                <Crosshair className="w-4 h-4 text-blue-400" />
              )}
              <span className="text-blue-300 text-sm font-medium">
                {validatingLocation ? 'Validating GPS...' : 'Validate Location First'}
              </span>
            </div>
            {!validatingLocation && (
              <p className="text-blue-200/50 text-xs mt-1">
                Tap to check GPS accuracy before {nextAction === 'TIME_IN' ? 'Time In' : 'Time Out'}
              </p>
            )}
          </button>
        )}

        {/* ── Main action button ─────────────────────────── */}
        <div className="relative">
          <button
            onClick={handleAttendanceAction}
            disabled={processing || !locationValidated || validatingLocation}
            className={`w-full relative overflow-hidden rounded-2xl p-6 text-center active:scale-[0.97] transition-all duration-200 shadow-xl disabled:opacity-60 ${
              locationValidated
                ? nextAction === 'TIME_IN'
                  ? 'bg-gradient-to-r from-green-500 to-emerald-600'
                  : 'bg-gradient-to-r from-orange-500 to-red-500'
                : 'bg-gradient-to-r from-gray-500 to-gray-600'
            }`}
          >
            <div className="flex items-center justify-center gap-3">
              <div className="w-14 h-14 bg-white/20 rounded-full flex items-center justify-center">
                {processing ? (
                  <Loader2 className="w-7 h-7 text-white animate-spin" />
                ) : !locationValidated ? (
                  <MapPin className="w-7 h-7 text-white/60" />
                ) : nextAction === 'TIME_IN' ? (
                  <LogInIcon className="w-7 h-7 text-white" />
                ) : (
                  <LogOutIcon className="w-7 h-7 text-white" />
                )}
              </div>
              <div className="text-left">
                <p className="text-white/80 text-xs font-medium">
                  {!locationValidated ? 'Location Required' : processing ? 'Processing...' : isCountingDown ? 'Get Ready...' : 'Ready to Record'}
                </p>
                <p className="text-white text-2xl font-bold">
                  {nextAction === 'TIME_IN' ? 'TIME IN' : 'TIME OUT'}
                </p>
              </div>
              <ChevronRight className={`w-6 h-6 ml-auto ${!locationValidated ? 'text-white/30' : 'text-white/60'}`} />
            </div>
            <div className="flex items-center justify-center gap-2 mt-3 text-white/70 text-xs">
              <Camera className="w-3.5 h-3.5" />
              <span>
                {!locationValidated ? 'Validate location first' : isCountingDown ? 'Photo capture starting...' : 'Photo capture ready'}
              </span>
            </div>
          </button>

          {/* Countdown Timer Overlay */}
          {isCountingDown && countdown !== null && (
            <div className="absolute bottom-2 right-2 z-10">
              <div className="relative w-12 h-12">
                {/* Circular progress background */}
                <svg className="transform -rotate-90 w-12 h-12">
                  <circle
                    cx="24"
                    cy="24"
                    r="20"
                    stroke="rgba(255,255,255,0.3)"
                    strokeWidth="3"
                    fill="none"
                  />
                  {/* Progress circle */}
                  <circle
                    cx="24"
                    cy="24"
                    r="20"
                    stroke="url(#gradient)"
                    strokeWidth="3"
                    fill="none"
                    strokeDasharray={`${2 * Math.PI * 20}`}
                    strokeDashoffset={`${2 * Math.PI * 20 * (1 - (30 - countdown) / 30)}`}
                    className="transition-all duration-1000 ease-linear"
                  />
                  {/* Gradient definition */}
                  <defs>
                    <linearGradient id="gradient" x1="0%" y1="0%" x2="100%" y2="100%">
                      <stop offset="0%" stopColor="#10b981" />
                      <stop offset="100%" stopColor="#3b82f6" />
                    </linearGradient>
                  </defs>
                </svg>
                {/* Countdown number */}
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="text-white font-bold text-sm">{countdown}</span>
                </div>
              </div>
            </div>
          )}
        </div>

      </div>

      {/* ── Bottom nav ───────────────────────────────────── */}
      <div className="fixed bottom-0 left-0 right-0 bg-slate-900/95 backdrop-blur-xl border-t border-white/10">
        <div className="flex items-end justify-around py-2 pb-3 max-w-lg mx-auto">
          {(
            [
              { id: 'home' as Tab, icon: Clock, label: 'Home' },
              { id: 'history' as Tab, icon: History, label: 'History' },
              { id: 'leave' as Tab, icon: FileText, label: 'Leave' },
              { id: 'leave-report' as Tab, icon: FileText, label: 'Reports' },
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

          {/* 3-dot menu */}
          <div className="relative">
            <button
              onClick={() => setShowMenu((prev: boolean) => !prev)}
              className="flex flex-col items-center gap-0.5 px-4 py-1.5 rounded-xl transition-all active:scale-90 text-white/40"
            >
              <MoreVertical className="w-5 h-5" />
              <span className="text-[10px] font-medium">Menu</span>
            </button>

            {showMenu && (
              <>
                <div
                  className="fixed inset-0 z-40"
                  onClick={() => setShowMenu(false)}
                />
                <div className="absolute bottom-12 right-0 z-50 bg-slate-800 border border-white/10 rounded-xl shadow-xl overflow-hidden min-w-[160px]">
                  <button
                    onClick={async () => {
                      setShowMenu(false);
                      if (installPrompt && !isInstalled) {
                        await installPrompt.prompt();
                      } else {
                        setShortcutNotice(true);
                      }
                    }}
                    className="w-full text-left px-4 py-3 text-white/80 text-sm hover:bg-white/10 active:bg-white/20 transition-colors"
                  >
                    Add Shortcut
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
