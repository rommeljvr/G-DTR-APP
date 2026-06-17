import { useState, useEffect, useMemo } from 'react';
import { User, AttendanceRecord } from '../types';
import { getAttendanceHistory } from '../utils/sheets';
import { getConfig } from '../utils/config';
import DriveImage from './DriveImage';
import {
  ArrowLeft,
  LogIn as LogInIcon,
  LogOut as LogOutIcon,
  Calendar,
  MapPin,
  Filter,
  X,
  Building2,
  Loader2,
  RefreshCw,
} from 'lucide-react';

interface Props {
  user: User;
  onBack: () => void;
}

export default function AttendanceHistory({ user, onBack }: Props) {
  const config = getConfig();
  const [filter, setFilter] = useState<'all' | 'TIME_IN' | 'TIME_OUT'>('all');
  const [previewSrc, setPreviewSrc] = useState<string | null>(null);
  const [allRecords, setAllRecords] = useState<AttendanceRecord[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    const records = await getAttendanceHistory(user.email);
    setAllRecords(records);
    setLoading(false);
  };

  useEffect(() => { load(); }, [user.email]);

  const filteredRecords = useMemo(() => {
    if (filter === 'all') return allRecords;
    return allRecords.filter((r) => r.action === filter);
  }, [allRecords, filter]);

  const groupedRecords = useMemo(() => {
    const groups: Record<string, AttendanceRecord[]> = {};
    filteredRecords.forEach((record) => {
      const date = record.date;
      if (!groups[date]) groups[date] = [];
      groups[date].push(record);
    });
    return groups;
  }, [filteredRecords]);

  const hasImage = (r: AttendanceRecord) => !!(r.photo || r.imageId);

  return (
    <div className="min-h-dvh flex flex-col pb-4">
      {/* Full-screen photo preview */}
      {previewSrc && (
        <div className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center px-4">
          <button
            onClick={() => setPreviewSrc(null)}
            className="absolute top-4 right-4 w-10 h-10 bg-white/10 rounded-full flex items-center justify-center text-white z-10"
          >
            <X className="w-5 h-5" />
          </button>
          <div className="w-full max-w-lg slide-up">
            <img src={previewSrc} alt="Record" className="w-full rounded-xl" />
          </div>
        </div>
      )}

      {/* Header */}
      <div className="bg-gradient-to-r from-blue-800 to-blue-900 px-4 pt-4 pb-5">
        <div className="flex items-center gap-3 mb-1">
          <button
            onClick={onBack}
            className="w-9 h-9 bg-white/10 rounded-full flex items-center justify-center text-white active:scale-90 transition-transform"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex-1">
            <h1 className="text-white font-bold text-lg">Attendance History</h1>
            <div className="flex items-center gap-1.5 mt-0.5">
              <Building2 className="w-3 h-3 text-emerald-400" />
              <span className="text-blue-200/60 text-[10px] font-semibold uppercase tracking-wider">
                {config.ORGANIZATION}
              </span>
              <span className="text-white/20 text-[10px] mx-0.5">•</span>
              <span className="text-blue-200/40 text-[10px]">
                {loading ? 'Loading…' : `${allRecords.length} records`}
              </span>
            </div>
          </div>
          <button
            onClick={load}
            disabled={loading}
            className="w-9 h-9 bg-white/10 rounded-full flex items-center justify-center text-white active:scale-90 transition-transform disabled:opacity-50"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
          </button>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-2 mt-3">
          <Filter className="w-4 h-4 text-blue-300/50" />
          {(
            [
              { id: 'all', label: 'All' },
              { id: 'TIME_IN', label: 'Time In' },
              { id: 'TIME_OUT', label: 'Time Out' },
            ] as const
          ).map(({ id, label }) => (
            <button
              key={id}
              onClick={() => setFilter(id)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all active:scale-95 ${
                filter === id ? 'bg-blue-500 text-white' : 'bg-white/10 text-white/60'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Records */}
      <div className="flex-1 px-4 mt-4 space-y-4">
        {loading && (
          <div className="text-center py-12">
            <Loader2 className="w-10 h-10 text-blue-400/50 mx-auto mb-3 animate-spin" />
            <p className="text-white/40 text-sm">Loading records…</p>
          </div>
        )}
        {!loading && Object.keys(groupedRecords).length === 0 && (
          <div className="text-center py-12">
            <Calendar className="w-12 h-12 text-white/20 mx-auto mb-3" />
            <p className="text-white/40 text-sm">No attendance records found</p>
          </div>
        )}

        {Object.entries(groupedRecords).map(([date, records]) => (
          <div key={date}>
            {/* Date header */}
            <div className="flex items-center gap-2 mb-2">
              <Calendar className="w-3.5 h-3.5 text-blue-400" />
              <p className="text-blue-300/80 text-xs font-semibold">{date}</p>
              <div className="flex-1 h-px bg-white/10" />
              <span className="text-white/30 text-[10px]">{records.length} entries</span>
            </div>

            <div className="space-y-2">
              {records.map((record, idx) => (
                <div
                  key={idx}
                  className="bg-white/5 backdrop-blur-sm rounded-xl overflow-hidden border border-white/5"
                >
                  {/* Photo – loaded from local base64 or fetched from Drive */}
                  {hasImage(record) && (
                    <div className="relative">
                      <DriveImage
                        photo={record.photo}
                        imageId={record.imageId}
                        className="w-full h-40"
                        onClick={(src) => setPreviewSrc(src)}
                      />
                      {/* Action badge */}
                      <div
                        className={`absolute top-2 left-2 px-2.5 py-1 rounded-full text-[10px] font-bold backdrop-blur-sm ${
                          record.action === 'TIME_IN'
                            ? 'bg-green-500/80 text-white'
                            : 'bg-orange-500/80 text-white'
                        }`}
                      >
                        {record.action === 'TIME_IN' ? '⏰ TIME IN' : '🚪 TIME OUT'}
                      </div>
                    </div>
                  )}

                  {/* Info row */}
                  <div className="p-3">
                    <div className="flex items-start gap-3">
                      {/* Icon (only when no photo) */}
                      {!hasImage(record) && (
                        <div
                          className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
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
                        <div className="flex items-center justify-between">
                          <p className="text-white font-semibold text-sm">
                            {record.action === 'TIME_IN' ? 'Time In' : 'Time Out'}
                          </p>
                          <p className="text-white/80 text-xs font-mono">{record.time}</p>
                        </div>

                        {record.address && (
                          <div className="flex items-start gap-1 mt-1">
                            <MapPin className="w-3 h-3 text-blue-400/50 mt-0.5 shrink-0" />
                            <p className="text-white/40 text-[11px] leading-tight line-clamp-2">
                              {record.address}
                            </p>
                          </div>
                        )}

                        <div className="flex items-center gap-3 mt-1.5">
                          <span className="text-white/30 text-[10px]">
                            📍 {record.latitude?.toFixed(4)}, {record.longitude?.toFixed(4)}
                          </span>
                          <span className="text-white/30 text-[10px]">
                            🎯 ±{record.accuracy?.toFixed(0) || '?'}m
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
