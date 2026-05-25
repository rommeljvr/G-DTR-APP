import { LocationData } from '../types';
import { getConfig } from './config';

export async function createCompositeImage(
  photoDataUrl: string,
  location: LocationData,
  deviceInfo: string
): Promise<string> {
  const config = getConfig();

  return new Promise((resolve) => {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d')!;
    const img = new Image();

    img.onload = async () => {
      const maxWidth = 1080;
      const scale = img.width > maxWidth ? maxWidth / img.width : 1;
      canvas.width = img.width * scale;
      canvas.height = img.height * scale;

      // Draw the employee photo as background
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

      // ── Top banner with organization ────────────────────────
      const bannerH = canvas.height * 0.06;
      const bannerGrad = ctx.createLinearGradient(0, 0, canvas.width, 0);
      bannerGrad.addColorStop(0, 'rgba(30,64,175,0.85)');
      bannerGrad.addColorStop(1, 'rgba(16,185,129,0.80)');
      ctx.fillStyle = bannerGrad;
      ctx.fillRect(0, 0, canvas.width, bannerH);

      const bannerFontSize = Math.max(12, Math.floor(bannerH * 0.5));
      ctx.font = `bold ${bannerFontSize}px 'Inter', sans-serif`;
      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'left';
      ctx.shadowColor = 'rgba(0,0,0,0.5)';
      ctx.shadowBlur = 3;
      ctx.fillText(config.ORGANIZATION, canvas.width * 0.03, bannerH * 0.65);

      ctx.textAlign = 'right';
      ctx.font = `${Math.floor(bannerFontSize * 0.85)}px 'Inter', sans-serif`;
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.fillText(config.APP_TITLE, canvas.width * 0.97, bannerH * 0.65);
      ctx.shadowBlur = 0;

      // ── Bottom overlay gradient ─────────────────────────────
      const overlayHeight = canvas.height * 0.32;
      const gradient = ctx.createLinearGradient(0, canvas.height - overlayHeight, 0, canvas.height);
      gradient.addColorStop(0, 'rgba(0, 0, 0, 0)');
      gradient.addColorStop(0.3, 'rgba(0, 0, 0, 0.7)');
      gradient.addColorStop(1, 'rgba(0, 0, 0, 0.92)');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, canvas.height - overlayHeight, canvas.width, overlayHeight);

      // Text sizing
      const fontSize = Math.max(12, Math.floor(canvas.width / 38));
      const smallFontSize = Math.max(10, Math.floor(fontSize * 0.78));
      const padding = Math.floor(canvas.width * 0.03);

      // Left side – date / time / GPS / address
      const leftX = padding;
      let textY = canvas.height - overlayHeight + overlayHeight * 0.35;
      const lineHeight = fontSize * 1.5;

      ctx.shadowColor = 'rgba(0,0,0,0.8)';
      ctx.shadowBlur = 4;
      ctx.textAlign = 'left';

      // Date
      ctx.font = `bold ${fontSize}px 'Inter', sans-serif`;
      ctx.fillStyle = '#ffffff';
      ctx.fillText(location.formattedDate, leftX, textY);
      textY += lineHeight;

      // Time
      ctx.font = `bold ${Math.floor(fontSize * 1.3)}px 'Inter', sans-serif`;
      ctx.fillStyle = '#4ade80';
      ctx.fillText(location.formattedTime, leftX, textY);
      textY += lineHeight;

      // GPS coords
      ctx.font = `${smallFontSize}px 'Inter', sans-serif`;
      ctx.fillStyle = '#e2e8f0';
      ctx.fillText(`📍 ${location.latitude.toFixed(6)}, ${location.longitude.toFixed(6)}`, leftX, textY);
      textY += smallFontSize * 1.4;

      // Accuracy
      ctx.fillText(`🎯 Accuracy: ±${location.accuracy.toFixed(1)}m`, leftX, textY);
      textY += smallFontSize * 1.4;

      // Address
      const maxAddrW = canvas.width * 0.58;
      let addr = location.address;
      ctx.font = `${smallFontSize}px 'Inter', sans-serif`;
      while (ctx.measureText(addr).width > maxAddrW && addr.length > 20) {
        addr = addr.slice(0, -4) + '...';
      }
      ctx.fillStyle = '#cbd5e1';
      ctx.fillText(`🏠 ${addr}`, leftX, textY);
      textY += smallFontSize * 1.4;

      // Device info
      ctx.font = `${Math.floor(smallFontSize * 0.85)}px 'Inter', sans-serif`;
      ctx.fillStyle = '#94a3b8';
      let devStr = deviceInfo;
      while (ctx.measureText(devStr).width > maxAddrW && devStr.length > 20) {
        devStr = devStr.slice(0, -4) + '...';
      }
      ctx.fillText(`📱 ${devStr}`, leftX, textY);

      // ── Right side – Map overlay ────────────────────────────
      try {
        const mapImg = new Image();
        mapImg.crossOrigin = 'anonymous';
        const mapSize = Math.floor(canvas.width * 0.32);
        const mapX = canvas.width - mapSize - padding;
        const mapY = canvas.height - mapSize - padding;

        const finalize = () => resolve(canvas.toDataURL('image/jpeg', 0.85));

        mapImg.onload = () => {
          ctx.shadowBlur = 0;
          const radius = 8;

          // Clip rounded rect
          ctx.save();
          ctx.beginPath();
          roundedRect(ctx, mapX, mapY, mapSize, mapSize, radius);
          ctx.clip();
          ctx.drawImage(mapImg, mapX, mapY, mapSize, mapSize);
          ctx.restore();

          // Border
          ctx.strokeStyle = 'rgba(255,255,255,0.8)';
          ctx.lineWidth = 2;
          ctx.beginPath();
          roundedRect(ctx, mapX, mapY, mapSize, mapSize, radius);
          ctx.stroke();

          // Label
          ctx.font = `bold ${Math.floor(smallFontSize * 0.8)}px 'Inter', sans-serif`;
          ctx.fillStyle = 'rgba(0,0,0,0.6)';
          ctx.fillRect(mapX, mapY, mapSize, smallFontSize * 1.5);
          ctx.fillStyle = '#ffffff';
          ctx.textAlign = 'center';
          ctx.fillText('📌 GPS Location', mapX + mapSize / 2, mapY + smallFontSize * 1.1);

          finalize();
        };

        mapImg.onerror = () => {
          ctx.shadowBlur = 0;
          ctx.fillStyle = 'rgba(30,64,175,0.8)';
          const radius = 8;
          ctx.beginPath();
          roundedRect(ctx, mapX, mapY, mapSize, mapSize, radius);
          ctx.fill();
          ctx.strokeStyle = 'rgba(255,255,255,0.8)';
          ctx.lineWidth = 2;
          ctx.stroke();

          ctx.font = `bold ${fontSize}px 'Inter', sans-serif`;
          ctx.fillStyle = '#ffffff';
          ctx.textAlign = 'center';
          ctx.fillText('📍', mapX + mapSize / 2, mapY + mapSize / 2 - fontSize);
          ctx.font = `${smallFontSize}px 'Inter', sans-serif`;
          ctx.fillText(`${location.latitude.toFixed(4)}`, mapX + mapSize / 2, mapY + mapSize / 2 + 5);
          ctx.fillText(`${location.longitude.toFixed(4)}`, mapX + mapSize / 2, mapY + mapSize / 2 + smallFontSize + 8);

          finalize();
        };

        mapImg.src = `https://staticmap.openstreetmap.de/staticmap.php?center=${location.latitude},${location.longitude}&zoom=16&size=300x300&markers=${location.latitude},${location.longitude},red-pushpin`;
      } catch {
        resolve(canvas.toDataURL('image/jpeg', 0.85));
      }
    };

    img.src = photoDataUrl;
  });
}

// helper – draw rounded rect path
function roundedRect(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number, r: number,
) {
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}
