/// <reference path="../pwa.d.ts" />
import { useState, useEffect, useCallback } from 'react';
import { User, AttendanceRecord, LocationData, MealAllowanceRecord, MealAllowanceConfig } from '../types';
import { getLastAction, submitAttendance, getNotifications, getMealAllowanceStatus, submitMealAllowance } from '../utils/sheets';
import { requestNotificationPermission, checkAndFirePushNotifications } from '../utils/pushNotification';
import { getLocationData, validateAddressCoordinates } from '../utils/location';
import { getDeviceString } from '../utils/device';
import { createCompositeImage } from '../utils/imageComposite';
import { getConfig } from '../utils/config';
import CameraCapture from './CameraCapture';
import AttendanceHistory from './AttendanceHistory';
import SetupScreen from './SetupScreen';
import LeaveApplication from './LeaveApplication';
import LeaveReport from './LeaveReport';
import EmployeeMaintenance from './EmployeeMaintenance';
import AttendanceMonitor from './AttendanceMonitor';
import LeaveApproval from './LeaveApproval';
import ApproverSettings from './ApproverSettings';
import NotificationInbox from './NotificationInbox';
import TimeCorrectionFiling from './TimeCorrectionFiling';
import TimeCorrectionReport from './TimeCorrectionReport';
import TimeCorrectionApproval from './TimeCorrectionApproval';
import DTRManagement from './DTRManagement';
import MealAllowanceSettings from './MealAllowanceSettings';
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
  ChevronRight,
  Crosshair,
  Building2,
  X,
  Briefcase,
  Menu,
  Smartphone,
  ClipboardList,
  BarChart2,
  Users,
  Bell,
  Shield,
  FileText,
  UtensilsCrossed,
} from 'lucide-react';

interface Props {
  user: User;
  onLogout: () => void;
  installPrompt?: BeforeInstallPromptEvent | null;
  isInstalled?: boolean;
}

type Tab = 'home' | 'history' | 'leave' | 'leave-report' | 'setup' | 'employees' | 'attendance-monitor' | 'leave-approval' | 'approver-settings' | 'notifications' | 'time-correction' | 'time-correction-report' | 'time-correction-approval' | 'dtr-management' | 'meal-allowance-settings';

export default function Dashboard({ user, onLogout, installPrompt, isInstalled }: Props) {
  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const isMobile = /iphone|ipad|ipod|android|mobile/i.test(navigator.userAgent);
  const config = getConfig();
  const emp = user.employee;
  const profileImage = (emp?.image && emp.image.startsWith('http')) ? emp.image : null;
  const hideOnError = (e: { target: EventTarget | null }) => { if (e.target) (e.target as HTMLImageElement).style.display = 'none'; };

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
  const [showDrawer, setShowDrawer] = useState(false);
  const [shortcutNotice, setShortcutNotice] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

  // Meal Allowance state
  const [maStatus, setMaStatus] = useState<{
    attendanceId: string | null;
    timeInTimestamp: string | null;
    hoursWorked: number;
    submissions: MealAllowanceRecord[];
    config: MealAllowanceConfig;
  } | null>(null);
  const [maLoading, setMaLoading] = useState(false);
  const [maPending, setMaPending] = useState<1 | 2 | null>(null);
  const [maRemarks, setMaRemarks] = useState('');
  const [showMaRemarks, setShowMaRemarks] = useState(false);
  const [maProcessing, setMaProcessing] = useState(false);

  const ADMIN_EMAIL = 'rommeljvr@gmail.com';

  const isSuperAdmin =
    user.email?.toLowerCase() === ADMIN_EMAIL.toLowerCase();

  const isAdmin =
    isSuperAdmin ||
    user.employee?.role?.toLowerCase() === 'admin';

  const nextAction: 'TIME_IN' | 'TIME_OUT' =
    lastAction?.action === 'TIME_IN' ? 'TIME_OUT' : 'TIME_IN';

  const formatDisplayDate = (val: string): string => val || '';

  const formatDisplayTime = (val: string): string => val || '';

  const loadMealAllowanceStatus = async () => {
    setMaLoading(true);
    try {
      const res = await getMealAllowanceStatus(user.email);
      if (res.success && res.config) setMaStatus(res as typeof maStatus);
    } catch { /* ignore */ } finally { setMaLoading(false); }
  };

  const loadRecords = async () => {
    const last = await getLastAction(user.email);
    console.log('[Dashboard] getLastAction returned:', last);
    console.log('[Dashboard] Record ID:', last?.id, '| Time:', last?.time, '| Date:', last?.date);
    setLastAction(last);
    await loadMealAllowanceStatus();
  };

  useEffect(() => {
    loadRecords();
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const handleMealAllowanceAction = (seq: 1 | 2) => {
    if (!locationValidated || !validatedLocation) {
      setNotification({ type: 'error', message: 'Please validate your location first.' });
      return;
    }
    setMaPending(seq);
    setMaRemarks('');
    setShowMaRemarks(true);
  };

  const handleMealAllowanceCapture = async (photoDataUrl: string) => {
    setShowCamera(false);
    setMaProcessing(true);
    setNotification(null);
    const loc = validatedLocation;
    if (!loc || maPending === null) { setMaProcessing(false); return; }
    try {
      const deviceInfo = getDeviceString();
      const compositePhoto = await createCompositeImage(
        photoDataUrl, loc, deviceInfo,
        maPending === 1 ? 'MEAL_ALLOWANCE_1' : 'MEAL_ALLOWANCE_2'
      );
      setCompositePreview(compositePhoto);
      const result = await submitMealAllowance({
        userEmail:  user.email,
        userName:   user.name,
        photo:      compositePhoto,
        latitude:   loc.latitude,
        longitude:  loc.longitude,
        accuracy:   loc.accuracy,
        address:    loc.address,
        deviceInfo,
        remarks:    maRemarks.trim() || undefined,
      });
      if (result.success) {
        setNotification({ type: 'success', message: result.message + (result.imageId ? '\n📷 Photo saved to Drive' : '') });
        setLocationValidated(false);
        setValidatedLocation(null);
        setIsCountingDown(false);
        setCountdown(null);
        await loadMealAllowanceStatus();
      } else {
        setNotification({ type: 'error', message: result.message });
      }
    } catch (err) {
      console.error('Meal allowance error:', err);
      setNotification({ type: 'error', message: 'Failed to submit. Please try again.' });
    } finally {
      setMaProcessing(false);
      setMaPending(null);
    }
  };

  useEffect(() => {
    requestNotificationPermission();
    const pollUnread = async () => {
      // Single fetch: derive unread count and fire push notifications in one pass
      const notifications = await getNotifications(user.email);
      const unread = notifications.filter((n: { isRead: boolean }) => !n.isRead);
      setUnreadCount(unread.length);
      if (unread.length > 0) await checkAndFirePushNotifications(user.email);
    };
    pollUnread();
    const poll = setInterval(pollUnread, 30000);
    return () => clearInterval(poll);
  }, [user.email]);

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

  const refreshLocationForValidation = async () => {
    setValidatingLocation(true);
    setNotification({
      type: 'success',
      message: 'Validating GPS location...',
    });

    try {
      let loc = await getLocationData();
      
      // Validate location accuracy (reject if > 100m accuracy)
      if (isMobile && loc.accuracy > 100) {
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
        message: `Location validated! ±${loc.accuracy.toFixed(1)}m · ${loc.address}`,
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
      const PH_TZ = 'Asia/Manila';
      const compositePhoto = await createCompositeImage(photoDataUrl, loc, deviceInfo, nextAction);
      setCompositePreview(compositePhoto);

      const record: Omit<AttendanceRecord, 'id'> = {
        userId: user.id,
        userName: user.name,
        userEmail: user.email,
        action: nextAction,
        timestamp: now.toLocaleString('sv-SE', { timeZone: PH_TZ }).replace(' ', 'T') + '+08:00',
        date: now.toLocaleDateString('en-US', { timeZone: PH_TZ }),
        time: now.toLocaleTimeString('en-US', {
          timeZone: PH_TZ,
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

  const handleNotifRead = useCallback(() => setUnreadCount(0), []);

  // ── Sub-screens ──────────────────────────────────────────

  if (showCamera) {
    return (
      <CameraCapture
        onCapture={maPending !== null ? handleMealAllowanceCapture : handleCameraCapture}
        onCancel={() => { setShowCamera(false); setMaPending(null); }}
      />
    );
  }

  if (activeTab === 'meal-allowance-settings') {
    if (!isSuperAdmin) return null;
    return <MealAllowanceSettings adminEmail={user.email} onBack={() => setActiveTab('home')} />;
  }

  if (activeTab === 'history') {
    return <AttendanceHistory user={user} onBack={() => setActiveTab('home')} />;
  }

  if (activeTab === 'setup') {
    if (!isAdmin) return null;
    return <SetupScreen onBack={() => setActiveTab('home')} />;
  }

  if (activeTab === 'employees') {
    if (!isAdmin) return null;
    return <EmployeeMaintenance onBack={() => setActiveTab('home')} />;
  }

  if (activeTab === 'attendance-monitor') {
    return <AttendanceMonitor user={user} onBack={() => setActiveTab('home')} />;
  }

  if (activeTab === 'notifications') {
    return <NotificationInbox user={user} onBack={() => setActiveTab('home')} onRead={handleNotifRead} onNavigateDTR={() => setActiveTab('dtr-management')} />;
  }

  if (activeTab === 'leave-approval') {
    return <LeaveApproval user={user} onBack={() => setActiveTab('home')} onUnreadChange={() => setUnreadCount(0)} />;
  }

  if (activeTab === 'approver-settings') {
    if (!isAdmin) return null;
    return <ApproverSettings user={user} onBack={() => setActiveTab('home')} />;
  }

  if (activeTab === 'leave') {
    return <LeaveApplication user={user} onBack={() => setActiveTab('home')} onViewReports={() => setActiveTab('leave-report')} />;
  }

  if (activeTab === 'time-correction') {
    return <TimeCorrectionFiling user={user} onBack={() => setActiveTab('home')} onViewReports={() => setActiveTab('time-correction-report')} />;
  }

  if (activeTab === 'time-correction-report') {
    return <TimeCorrectionReport user={user} onBack={() => setActiveTab('time-correction')} />;
  }

  if (activeTab === 'time-correction-approval') {
    return <TimeCorrectionApproval user={user} onBack={() => setActiveTab('home')} />;
  }

  if (activeTab === 'leave-report') {
    return <LeaveReport user={user} onBack={() => setActiveTab('leave')} />;
  }

  if (activeTab === 'dtr-management') {
    return <DTRManagement user={user} onBack={() => setActiveTab('home')} />;
  }

  // Derived meal allowance display state
  const maEnabled = maStatus?.config?.enabled ?? false;
  const isClockedIn = lastAction?.action === 'TIME_IN';
  const maCount = maStatus?.submissions?.length ?? 0;
  const maMax = maStatus?.config?.maxCount ?? 2;
  const maHours = maStatus?.hoursWorked ?? 0;
  const ma1Done = maStatus?.submissions?.some(s => s.sequence === 1) ?? false;
  const ma2Done = maStatus?.submissions?.some(s => s.sequence === 2) ?? false;
  const ma1MinH = maStatus?.config?.minHours1 ?? 0;
  const ma2MinH = maStatus?.config?.minHours2 ?? 8;
  const ma1Eligible = isClockedIn && maEnabled && !ma1Done && maHours >= ma1MinH && maCount < maMax;
  const ma2Eligible = isClockedIn && maEnabled && (maStatus?.config?.secondEnabled ?? false) && ma1Done && !ma2Done && maHours >= ma2MinH && maCount < maMax;
  const showMaSection = maEnabled && isClockedIn;

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
            <div className="w-12 h-12 rounded-full shrink-0 overflow-hidden bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center">
              {profileImage
                ? <img src={profileImage} alt={user.name} className="w-full h-full object-cover" onError={hideOnError} />
                : <UserIcon className="w-6 h-6 text-white" />}
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
              timeZone: 'Asia/Manila',
              weekday: 'long',
              month: 'long',
              day: 'numeric',
              year: 'numeric',
            })}
          </p>
          <p className="text-white text-4xl font-bold tracking-wider tabular-nums">
            {currentTime.toLocaleTimeString('en-US', {
              timeZone: 'Asia/Manila',
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

      </div>{/* end flex-1 content section */}

      {/* Meal Allowance remarks modal */}
      {showMaRemarks && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center px-4">
          <div className="bg-slate-900/95 backdrop-blur-xl rounded-2xl p-6 w-full max-w-sm border border-white/10">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-amber-500/20 rounded-xl flex items-center justify-center">
                <UtensilsCrossed className="w-5 h-5 text-amber-400" />
              </div>
              <div>
                <h3 className="text-white font-bold text-base">Meal Allowance {maPending}</h3>
                <p className="text-white/40 text-xs">Add optional remarks</p>
              </div>
            </div>
            <textarea
              value={maRemarks}
              onChange={e => setMaRemarks(e.target.value)}
              placeholder="Optional: reason or notes…"
              rows={3}
              className="w-full bg-white/5 border border-white/10 text-white text-sm rounded-xl px-3 py-2.5 outline-none resize-none placeholder-white/30 mb-4"
            />
            <div className="flex gap-3">
              <button
                onClick={() => { setShowMaRemarks(false); setMaPending(null); }}
                className="flex-1 bg-white/10 text-white/70 font-medium py-2.5 rounded-xl active:scale-95 transition-transform text-sm"
              >Cancel</button>
              <button
                onClick={() => { setShowMaRemarks(false); setCompositePreview(null); setShowCamera(true); }}
                className="flex-1 bg-gradient-to-r from-amber-500 to-amber-600 text-white font-semibold py-2.5 rounded-xl active:scale-95 transition-transform text-sm flex items-center justify-center gap-2"
              >
                <Camera className="w-4 h-4" /> Take Photo
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Meal Allowance section ────────────────────── */}
      {showMaSection && (
        <div className="px-4 space-y-2">
          <div className="bg-white/5 border border-white/8 rounded-2xl p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <UtensilsCrossed className="w-4 h-4 text-amber-400" />
                <span className="text-white/70 text-xs font-semibold uppercase tracking-wider">Meal Allowance</span>
              </div>
              {maLoading && <Loader2 className="w-3.5 h-3.5 text-white/30 animate-spin" />}
              <span className="text-white/30 text-[10px]">{maCount}/{maMax} used · {maHours.toFixed(1)}h worked</span>
            </div>

            <div className="grid grid-cols-2 gap-2">
              {/* 1st Meal Allowance */}
              {(() => {
                const sub1 = maStatus?.submissions?.find(s => s.sequence === 1);
                return (
                  <div className={`rounded-xl border p-3 text-center ${
                    ma1Done
                      ? 'bg-emerald-500/10 border-emerald-400/20'
                      : ma1Eligible
                      ? 'bg-amber-500/10 border-amber-400/20'
                      : 'bg-white/3 border-white/8'
                  }`}>
                    <p className={`text-[10px] font-semibold mb-1.5 ${
                      ma1Done ? 'text-emerald-300' : ma1Eligible ? 'text-amber-300' : 'text-white/30'
                    }`}>
                      {ma1Done ? '✓ Submitted' : ma1Eligible ? 'Available' : maHours < ma1MinH ? `Eligible in ${(ma1MinH - maHours).toFixed(1)}h` : 'Not eligible'}
                    </p>
                    <p className="text-white text-xs font-medium mb-2">1st Meal</p>
                    {sub1?.imageUrl ? (
                      <button
                        onClick={() => setPreviewPhoto(sub1.imageUrl)}
                        className="w-full rounded-lg overflow-hidden border border-emerald-400/20 active:scale-95 transition-transform"
                      >
                        <img src={sub1.imageUrl} alt="Meal 1 photo" className="w-full h-16 object-cover" />
                        <p className="text-emerald-300/60 text-[9px] py-0.5">Tap to view</p>
                      </button>
                    ) : ma1Eligible ? (
                      <button
                        onClick={() => handleMealAllowanceAction(1)}
                        disabled={maProcessing}
                        className="w-full bg-amber-500/20 text-amber-300 border border-amber-400/20 text-[10px] font-semibold py-1.5 rounded-lg active:scale-95 transition-transform disabled:opacity-50"
                      >
                        {maProcessing && maPending === 1 ? <Loader2 className="w-3 h-3 animate-spin mx-auto" /> : 'Claim'}
                      </button>
                    ) : null}
                  </div>
                );
              })()}

              {/* 2nd Meal Allowance */}
              {(() => {
                const sub2 = maStatus?.submissions?.find(s => s.sequence === 2);
                return (
                  <div className={`rounded-xl border p-3 text-center ${
                    ma2Done
                      ? 'bg-emerald-500/10 border-emerald-400/20'
                      : ma2Eligible
                      ? 'bg-violet-500/10 border-violet-400/20'
                      : 'bg-white/3 border-white/8'
                  }`}>
                    <p className={`text-[10px] font-semibold mb-1.5 ${
                      ma2Done ? 'text-emerald-300'
                      : !(maStatus?.config?.secondEnabled) ? 'text-white/20'
                      : ma2Eligible ? 'text-violet-300'
                      : 'text-white/30'
                    }`}>
                      {ma2Done ? '✓ Submitted'
                        : !(maStatus?.config?.secondEnabled) ? 'Disabled'
                        : !ma1Done ? '1st required first'
                        : ma2Eligible ? 'Available'
                        : `Eligible in ${Math.max(0, ma2MinH - maHours).toFixed(1)}h`}
                    </p>
                    <p className="text-white text-xs font-medium mb-2">2nd Meal</p>
                    {sub2?.imageUrl ? (
                      <button
                        onClick={() => setPreviewPhoto(sub2.imageUrl)}
                        className="w-full rounded-lg overflow-hidden border border-emerald-400/20 active:scale-95 transition-transform"
                      >
                        <img src={sub2.imageUrl} alt="Meal 2 photo" className="w-full h-16 object-cover" />
                        <p className="text-emerald-300/60 text-[9px] py-0.5">Tap to view</p>
                      </button>
                    ) : ma2Eligible ? (
                      <button
                        onClick={() => handleMealAllowanceAction(2)}
                        disabled={maProcessing}
                        className="w-full bg-violet-500/20 text-violet-300 border border-violet-400/20 text-[10px] font-semibold py-1.5 rounded-lg active:scale-95 transition-transform disabled:opacity-50"
                      >
                        {maProcessing && maPending === 2 ? <Loader2 className="w-3 h-3 animate-spin mx-auto" /> : 'Claim'}
                      </button>
                    ) : null}
                  </div>
                );
              })()}
            </div>
          </div>
        </div>
      )}

      {/* ── Drawer overlay backdrop ───────────────────── */}
      {showDrawer && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40"
          onClick={() => setShowDrawer(false)}
        />
      )}

      {/* ── Drawer panel ─────────────────────────────── */}
      <div
        className={`fixed top-0 right-0 h-full w-72 max-w-[85vw] z-50 flex flex-col bg-slate-900 border-l border-white/10 shadow-2xl transition-transform duration-300 ease-in-out ${
          showDrawer ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        {/* Drawer header – close */}
        <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-white/10">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 bg-white/10 rounded-lg p-0.5">
              <img src="/logo.png" alt="" className="w-full h-full object-contain" />
            </div>
            <span className="text-white/80 font-semibold text-sm">Menu</span>
          </div>
          <button
            onClick={() => setShowDrawer(false)}
            className="w-8 h-8 flex items-center justify-center rounded-xl bg-white/10 active:scale-90 transition-transform"
          >
            <X className="w-4 h-4 text-white" />
          </button>
        </div>

        {/* User profile */}
        <div className="px-5 py-4 border-b border-white/10">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-full shrink-0 overflow-hidden bg-gradient-to-br from-blue-400 to-blue-700 flex items-center justify-center">
              {profileImage
                ? <img src={profileImage} alt={user.name} className="w-full h-full object-cover" onError={hideOnError} />
                : <UserIcon className="w-5 h-5 text-white" />}
            </div>
            <div className="min-w-0">
              <p className="text-white font-semibold text-sm truncate">{user.name}</p>
              <p className="text-white/40 text-xs truncate">{user.email}</p>
              {emp?.department && (
                <span className="text-emerald-400/80 text-[10px] font-medium bg-emerald-500/10 px-1.5 py-0.5 rounded mt-0.5 inline-block">
                  {emp.department}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Nav items */}
        <nav className="flex-1 px-3 py-3 space-y-1 overflow-y-auto">
          <button
            onClick={() => { setShowDrawer(false); setActiveTab('leave'); }}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-colors active:scale-[0.98] ${
              activeTab === 'leave' ? 'bg-blue-500/20 text-blue-300 border border-blue-400/20' : 'text-white/70 hover:bg-white/8'
            }`}
          >
            <ClipboardList className="w-4.5 h-4.5 shrink-0" />
            Leave Filing
          </button>

          <button
            onClick={() => { setShowDrawer(false); setActiveTab('time-correction'); }}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-colors active:scale-[0.98] ${
              activeTab === 'time-correction' ? 'bg-blue-500/20 text-blue-300 border border-blue-400/20' : 'text-white/70 hover:bg-white/8'
            }`}
          >
            <Clock className="w-4.5 h-4.5 shrink-0" />
            Time Correction
          </button>

          <button
            onClick={() => { setShowDrawer(false); setActiveTab('leave-report'); }}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-colors active:scale-[0.98] ${
              activeTab === 'leave-report' ? 'bg-blue-500/20 text-blue-300 border border-blue-400/20' : 'text-white/70 hover:bg-white/8'
            }`}
          >
            <BarChart2 className="w-4.5 h-4.5 shrink-0" />
            Leave Reports
          </button>

          <button
            onClick={async () => {
              setShowDrawer(false);
              if (installPrompt && !isInstalled) {
                await installPrompt.prompt();
              } else {
                setShortcutNotice(true);
              }
            }}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium text-white/70 hover:bg-white/8 transition-colors active:scale-[0.98]"
          >
            <Smartphone className="w-4.5 h-4.5 shrink-0" />
            Add Shortcut
          </button>

          <button
              onClick={() => { setShowDrawer(false); setActiveTab('attendance-monitor'); }}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-colors active:scale-[0.98] ${
                activeTab === 'attendance-monitor' ? 'bg-blue-500/20 text-blue-300 border border-blue-400/20' : 'text-white/70 hover:bg-white/8'
              }`}
            >
              <Users className="w-4.5 h-4.5 shrink-0" />
              Attendance Monitor
            </button>

          <button
            onClick={() => { setShowDrawer(false); setActiveTab('notifications'); }}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-colors active:scale-[0.98] ${
              activeTab === 'notifications' ? 'bg-blue-500/20 text-blue-300 border border-blue-400/20' : 'text-white/70 hover:bg-white/8'
            }`}
          >
            <Bell className="w-4.5 h-4.5 shrink-0" />
            Notifications
            {unreadCount > 0 && (
              <span className="ml-auto min-w-[18px] h-[18px] bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center px-1">
                {unreadCount > 99 ? '99+' : unreadCount}
              </span>
            )}
          </button>

          <button
            onClick={() => { setShowDrawer(false); setActiveTab('leave-approval'); }}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-colors active:scale-[0.98] ${
              activeTab === 'leave-approval' ? 'bg-blue-500/20 text-blue-300 border border-blue-400/20' : 'text-white/70 hover:bg-white/8'
            }`}
          >
            <ClipboardList className="w-4.5 h-4.5 shrink-0" />
            Leave Approvals
          </button>

          <button
            onClick={() => { setShowDrawer(false); setActiveTab('time-correction-approval'); }}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-colors active:scale-[0.98] ${
              activeTab === 'time-correction-approval' ? 'bg-blue-500/20 text-blue-300 border border-blue-400/20' : 'text-white/70 hover:bg-white/8'
            }`}
          >
            <Clock className="w-4.5 h-4.5 shrink-0" />
            TC Approvals
          </button>

          {isAdmin && (
            <button
              onClick={() => { setShowDrawer(false); setActiveTab('approver-settings'); }}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-colors active:scale-[0.98] ${
                activeTab === 'approver-settings' ? 'bg-blue-500/20 text-blue-300 border border-blue-400/20' : 'text-white/70 hover:bg-white/8'
              }`}
            >
              <Shield className="w-4.5 h-4.5 shrink-0" />
              Approver Settings
              <span className="ml-auto text-[10px] bg-amber-400/15 text-amber-400 border border-amber-400/20 px-1.5 py-0.5 rounded font-semibold">Admin</span>
            </button>
          )}

          {isAdmin && (
            <button
              onClick={() => { setShowDrawer(false); setActiveTab('employees'); }}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-colors active:scale-[0.98] ${
                activeTab === 'employees' ? 'bg-blue-500/20 text-blue-300 border border-blue-400/20' : 'text-white/70 hover:bg-white/8'
              }`}
            >
              <Building2 className="w-4.5 h-4.5 shrink-0" />
              Employee Maintenance
              <span className="ml-auto text-[10px] bg-amber-400/15 text-amber-400 border border-amber-400/20 px-1.5 py-0.5 rounded font-semibold">Admin</span>
            </button>
          )}

          <button
            onClick={() => { setShowDrawer(false); setActiveTab('dtr-management'); }}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-colors active:scale-[0.98] ${
              activeTab === 'dtr-management' ? 'bg-blue-500/20 text-blue-300 border border-blue-400/20' : 'text-white/70 hover:bg-white/8'
            }`}
          >
            <FileText className="w-4.5 h-4.5 shrink-0" />
            DTR Management
          </button>

          {isSuperAdmin && (
            <button
              onClick={() => { setShowDrawer(false); setActiveTab('setup'); }}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-colors active:scale-[0.98] ${
                activeTab === 'setup' ? 'bg-blue-500/20 text-blue-300 border border-blue-400/20' : 'text-white/70 hover:bg-white/8'
              }`}
            >
              <Settings className="w-4.5 h-4.5 shrink-0" />
              Settings
              <span className="ml-auto text-[10px] bg-amber-400/15 text-amber-400 border border-amber-400/20 px-1.5 py-0.5 rounded font-semibold">Admin</span>
            </button>
          )}

          {isSuperAdmin && (
            <button
              onClick={() => { setShowDrawer(false); setActiveTab('meal-allowance-settings'); }}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-colors active:scale-[0.98] ${
                activeTab === 'meal-allowance-settings' ? 'bg-violet-500/20 text-violet-300 border border-violet-400/20' : 'text-white/70 hover:bg-white/8'
              }`}
            >
              <UtensilsCrossed className="w-4.5 h-4.5 shrink-0" />
              Meal Allowance Settings
              <span className="ml-auto text-[10px] bg-amber-400/15 text-amber-400 border border-amber-400/20 px-1.5 py-0.5 rounded font-semibold">Admin</span>
            </button>
          )}
        </nav>

        {/* Drawer footer – logout */}
        <div className="px-3 pb-6 pt-2 border-t border-white/10">
          <button
            onClick={() => { setShowDrawer(false); onLogout(); }}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium text-red-400/80 hover:bg-red-500/10 transition-colors active:scale-[0.98]"
          >
            <LogOutIcon className="w-4.5 h-4.5 shrink-0" />
            Logout
          </button>
        </div>
      </div>

      {/* ── Bottom nav ───────────────────────────────────── */}
      <div className="fixed bottom-0 left-0 right-0 bg-slate-900/95 backdrop-blur-xl border-t border-white/10">
        <div className="flex items-end justify-around py-2 pb-3 max-w-lg mx-auto">
          {(
            [
              { id: 'home' as Tab, icon: Clock, label: 'Home' },
              { id: 'history' as Tab, icon: History, label: 'History' },
            ] as const
          ).map(({ id, icon: Icon, label }) => (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              className={`flex flex-col items-center gap-0.5 px-6 py-1.5 rounded-xl transition-all active:scale-90 ${
                activeTab === id ? 'text-blue-400' : 'text-white/40'
              }`}
            >
              <Icon className="w-5 h-5" />
              <span className="text-[10px] font-medium">{label}</span>
            </button>
          ))}

          {/* Bell shortcut → personal notification inbox */}
          <button
            onClick={() => setActiveTab('notifications')}
            className={`relative flex flex-col items-center gap-0.5 px-6 py-1.5 rounded-xl transition-all active:scale-90 ${
              activeTab === 'notifications' ? 'text-blue-400' : 'text-white/40'
            }`}
          >
            <Bell className="w-5 h-5" />
            {unreadCount > 0 && (
              <span className="absolute -top-0.5 right-3 min-w-[14px] h-[14px] bg-red-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center px-0.5">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
            <span className="text-[10px] font-medium">Inbox</span>
          </button>

          {/* Hamburger → drawer */}
          <button
            onClick={() => setShowDrawer(true)}
            className={`flex flex-col items-center gap-0.5 px-6 py-1.5 rounded-xl transition-all active:scale-90 ${
              ['leave','leave-report','setup'].includes(activeTab) ? 'text-blue-400' : 'text-white/40'
            }`}
          >
            <Menu className="w-5 h-5" />
            <span className="text-[10px] font-medium">More</span>
          </button>
        </div>
      </div>
    </div>
  );
}

