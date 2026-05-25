import { useState, useEffect } from 'react';
import { fetchImageBase64 } from '../utils/sheets';
import { Loader2, ImageOff } from 'lucide-react';

interface Props {
  /** Local base64 photo (from localStorage) */
  photo?: string;
  /** Google Drive file ID (fetched via endpoint as base64) */
  imageId?: string;
  alt?: string;
  className?: string;
  /** When true show a small thumbnail style */
  thumbnail?: boolean;
  onClick?: (src: string) => void;
}

/**
 * Smart image component that:
 * 1. Uses local base64 `photo` if available
 * 2. Falls back to fetching from Google Drive via `imageId` endpoint
 * 3. Shows loading spinner while fetching
 * 4. Shows placeholder on error
 */
export default function DriveImage({
  photo,
  imageId,
  alt = '',
  className = '',
  thumbnail = false,
  onClick,
}: Props) {
  const [src, setSrc] = useState<string | null>(photo || null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    // Already have a local photo
    if (photo) {
      setSrc(photo);
      return;
    }

    // No local photo → fetch from Drive via base64 endpoint
    if (imageId) {
      setLoading(true);
      setError(false);
      fetchImageBase64(imageId)
        .then((base64) => {
          if (base64) {
            setSrc(base64);
          } else {
            setError(true);
          }
        })
        .catch(() => setError(true))
        .finally(() => setLoading(false));
    }
  }, [photo, imageId]);

  // Nothing to show
  if (!photo && !imageId) return null;

  // Loading state
  if (loading) {
    return (
      <div
        className={`flex items-center justify-center bg-white/5 ${className} ${
          thumbnail ? 'rounded-lg' : 'rounded-xl'
        }`}
      >
        <div className="text-center">
          <Loader2 className="w-5 h-5 text-blue-400 animate-spin mx-auto" />
          {!thumbnail && (
            <p className="text-white/40 text-[10px] mt-1">Loading image…</p>
          )}
        </div>
      </div>
    );
  }

  // Error state
  if (error || !src) {
    return (
      <div
        className={`flex items-center justify-center bg-white/5 ${className} ${
          thumbnail ? 'rounded-lg' : 'rounded-xl'
        }`}
      >
        <div className="text-center">
          <ImageOff className="w-5 h-5 text-white/20 mx-auto" />
          {!thumbnail && (
            <p className="text-white/30 text-[10px] mt-1">Image unavailable</p>
          )}
        </div>
      </div>
    );
  }

  // Render image
  if (onClick) {
    return (
      <button
        onClick={() => onClick(src)}
        className={`block active:opacity-80 transition-opacity ${className}`}
      >
        <img src={src} alt={alt} className="w-full h-full object-cover" />
      </button>
    );
  }

  return <img src={src} alt={alt} className={`object-cover ${className}`} />;
}
