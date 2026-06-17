import { useRef, useState, useEffect, useCallback } from 'react';
import { Camera, RotateCcw, X, Check, Loader2, AlertCircle } from 'lucide-react';

interface Props {
  onCapture: (photoDataUrl: string) => void;
  onCancel: () => void;
}

export default function CameraCapture({ onCapture, onCancel }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [capturedPhoto, setCapturedPhoto] = useState<string | null>(null);
  const [error, setError] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user');

  const stopStream = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
  }, []);

  const startCamera = useCallback(async (facing: 'user' | 'environment') => {
    setLoading(true);
    setError('');
    stopStream();

    try {
      const constraints: MediaStreamConstraints = {
        video: {
          facingMode: facing,
          width: { ideal: 1280 },
          height: { ideal: 720 },
        } as MediaTrackConstraints,
        audio: false,
      };

      const mediaStream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = mediaStream;

      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
        await videoRef.current.play();
      }
    } catch (err) {
      console.error('Camera error:', err);
      if (err instanceof DOMException && err.name === 'NotAllowedError') {
        setError('Camera access denied. Please allow camera permissions in your browser settings.');
      } else if (err instanceof DOMException && err.name === 'NotFoundError') {
        setError('No camera found on this device.');
      } else {
        setError('Unable to access camera. Please check permissions.');
      }
    } finally {
      setLoading(false);
    }
  }, [stopStream]);

  useEffect(() => {
    startCamera(facingMode);
    return () => {
      stopStream();
    };
  }, []);

  const switchCamera = () => {
    const newFacing = facingMode === 'user' ? 'environment' : 'user';
    setFacingMode(newFacing);
    startCamera(newFacing);
  };

  const capturePhoto = () => {
    if (!videoRef.current || !canvasRef.current) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    const ctx = canvas.getContext('2d')!;

    // Mirror the image if using front camera
    if (facingMode === 'user') {
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
    }

    ctx.drawImage(video, 0, 0);

    const dataUrl = canvas.toDataURL('image/jpeg', 0.92);
    setCapturedPhoto(dataUrl);
    stopStream();
  };

  const retake = () => {
    setCapturedPhoto(null);
    startCamera(facingMode);
  };

  const confirmPhoto = () => {
    if (capturedPhoto) {
      onCapture(capturedPhoto);
    }
  };

  return (
    <div className="fixed inset-0 bg-black z-50 flex flex-col">
      {/* Header */}
      <div className="absolute top-0 left-0 right-0 z-10 flex items-center justify-between px-4 py-3 bg-gradient-to-b from-black/70 to-transparent safe-top">
        <button
          onClick={() => {
            stopStream();
            onCancel();
          }}
          className="w-10 h-10 flex items-center justify-center rounded-full bg-black/40 text-white active:scale-90 transition-transform"
        >
          <X className="w-5 h-5" />
        </button>
        <span className="text-white font-semibold text-sm">Take Selfie</span>
        {!capturedPhoto ? (
          <button
            onClick={switchCamera}
            className="w-10 h-10 flex items-center justify-center rounded-full bg-black/40 text-white active:scale-90 transition-transform"
          >
            <RotateCcw className="w-5 h-5" />
          </button>
        ) : (
          <div className="w-10" />
        )}
      </div>

      {/* Camera View / Photo Preview */}
      <div className="flex-1 flex items-center justify-center overflow-hidden bg-black">
        {loading && !capturedPhoto && (
          <div className="text-center text-white">
            <Loader2 className="w-10 h-10 animate-spin mx-auto mb-3" />
            <p className="text-sm">Starting camera...</p>
          </div>
        )}

        {error && (
          <div className="text-center text-white px-6">
            <AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-3" />
            <p className="text-red-300 text-sm mb-4">{error}</p>
            <button
              onClick={() => startCamera(facingMode)}
              className="bg-blue-600 text-white px-6 py-2.5 rounded-xl text-sm font-medium active:scale-95 transition-transform"
            >
              Try Again
            </button>
          </div>
        )}

        {!capturedPhoto ? (
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className={`w-full h-full object-cover ${facingMode === 'user' ? 'camera-mirror' : ''}`}
            style={{ display: loading || error ? 'none' : 'block' }}
          />
        ) : (
          <img
            src={capturedPhoto}
            alt="Captured"
            className="w-full h-full object-cover fade-in"
          />
        )}
      </div>

      {/* Canvas for capture (hidden) */}
      <canvas ref={canvasRef} className="hidden" />

      {/* Bottom Controls */}
      <div className="absolute bottom-0 left-0 right-0 pb-8 pt-4 bg-gradient-to-t from-black/80 to-transparent">
        {!capturedPhoto ? (
          <div className="flex items-center justify-center">
            <button
              onClick={capturePhoto}
              disabled={loading || !!error}
              className="relative w-[72px] h-[72px] rounded-full border-4 border-white flex items-center justify-center active:scale-90 transition-transform disabled:opacity-40"
            >
              <div className="w-[58px] h-[58px] rounded-full bg-white flex items-center justify-center">
                <Camera className="w-7 h-7 text-gray-800" />
              </div>
            </button>
          </div>
        ) : (
          <div className="flex items-center justify-center gap-8">
            <button
              onClick={retake}
              className="flex flex-col items-center gap-1 active:scale-90 transition-transform"
            >
              <div className="w-14 h-14 rounded-full bg-red-500/80 flex items-center justify-center">
                <RotateCcw className="w-6 h-6 text-white" />
              </div>
              <span className="text-white text-xs">Retake</span>
            </button>
            <button
              onClick={confirmPhoto}
              className="flex flex-col items-center gap-1 active:scale-90 transition-transform"
            >
              <div className="w-14 h-14 rounded-full bg-green-500/80 flex items-center justify-center">
                <Check className="w-6 h-6 text-white" />
              </div>
              <span className="text-white text-xs">Use Photo</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
