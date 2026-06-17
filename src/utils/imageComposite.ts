import { LocationData } from '../types';
import { getConfig } from './config';

export async function createCompositeImage(
  photoDataUrl: string,
  location: LocationData,
  deviceInfo: string,
  action: 'TIME_IN' | 'TIME_OUT' = 'TIME_IN'
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

      // ── Logo watermark (top-left, first) ─────────────────────
      const logoSize = Math.min(60, canvas.width * 0.12);  // 20% bigger (was 50/10%)
      const logoPadding = canvas.width * 0.03;
      const logoX = logoPadding;
      const logoY = bannerH + canvas.height * 0.02;
      await drawLogoWatermarkAt(ctx, logoX, logoY, logoSize);

      // ── Action badge (TIME IN / TIME OUT) ──────────────────
      const isTimeIn = action === 'TIME_IN';
      const badgeLabel = isTimeIn ? '▶  TIME IN' : '◼  TIME OUT';
      const badgeFontSize = Math.max(14, Math.floor(canvas.width / 22));
      ctx.font = `900 ${badgeFontSize}px 'Inter', Arial, sans-serif`;
      const badgePadX = badgeFontSize * 1.1;
      const badgePadY = badgeFontSize * 0.55;
      const badgeW = ctx.measureText(badgeLabel).width + badgePadX * 2;
      const badgeH = badgeFontSize + badgePadY * 2;
      const badgeX = logoX + logoSize + canvas.width * 0.025;  // Right of logo
      const badgeY = logoY + (logoSize - badgeH) / 2;          // Center aligned with logo
      const badgeBg = isTimeIn ? 'rgba(16,185,129,0.92)' : 'rgba(239,68,68,0.92)';
      const badgeRadius = badgeH * 0.35;

      // Shadow
      ctx.save();
      ctx.shadowColor = 'rgba(0,0,0,0.45)';
      ctx.shadowBlur = 10;
      ctx.shadowOffsetY = 3;
      ctx.fillStyle = badgeBg;
      ctx.beginPath();
      roundedRect(ctx, badgeX, badgeY, badgeW, badgeH, badgeRadius);
      ctx.fill();
      ctx.restore();

      // Badge text
      ctx.font = `900 ${badgeFontSize}px 'Inter', Arial, sans-serif`;
      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'center';
      ctx.shadowColor = 'rgba(0,0,0,0.4)';
      ctx.shadowBlur = 3;
      ctx.fillText(badgeLabel, badgeX + badgeW / 2, badgeY + badgeH * 0.68);
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
          const radius = 8;
          
          // Draw map-like background (terrain style)
          const mapBg = ctx.createLinearGradient(mapX, mapY, mapX + mapSize, mapY + mapSize);
          mapBg.addColorStop(0, '#e8f5e9');   // light green
          mapBg.addColorStop(0.5, '#c8e6c9'); // medium green
          mapBg.addColorStop(1, '#a5d6a7');  // darker green
          ctx.fillStyle = mapBg;
          ctx.beginPath();
          roundedRect(ctx, mapX, mapY, mapSize, mapSize, radius);
          ctx.fill();
          
          // Draw "roads" (grid lines)
          ctx.strokeStyle = 'rgba(255,255,255,0.6)';
          ctx.lineWidth = 2;
          for (let i = 1; i < 4; i++) {
            // Vertical roads
            ctx.beginPath();
            ctx.moveTo(mapX + (mapSize * i / 4), mapY);
            ctx.lineTo(mapX + (mapSize * i / 4), mapY + mapSize);
            ctx.stroke();
            // Horizontal roads
            ctx.beginPath();
            ctx.moveTo(mapX, mapY + (mapSize * i / 4));
            ctx.lineTo(mapX + mapSize, mapY + (mapSize * i / 4));
            ctx.stroke();
          }
          
          // Border
          ctx.strokeStyle = 'rgba(255,255,255,0.9)';
          ctx.lineWidth = 3;
          ctx.beginPath();
          roundedRect(ctx, mapX, mapY, mapSize, mapSize, radius);
          ctx.stroke();
          
          // Draw pin marker
          const pinX = mapX + mapSize / 2;
          const pinY = mapY + mapSize / 2;
          
          // Pin shadow
          ctx.fillStyle = 'rgba(0,0,0,0.3)';
          ctx.beginPath();
          ctx.ellipse(pinX, pinY + 8, 6, 3, 0, 0, Math.PI * 2);
          ctx.fill();
          
          // Pin body
          ctx.fillStyle = '#dc2626'; // red-600
          ctx.beginPath();
          ctx.arc(pinX, pinY - 8, 8, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = '#991b1b'; // darker red for bottom
          ctx.beginPath();
          ctx.moveTo(pinX, pinY - 8);
          ctx.lineTo(pinX - 6, pinY);
          ctx.lineTo(pinX + 6, pinY);
          ctx.closePath();
          ctx.fill();
          
          // Pin center dot
          ctx.fillStyle = '#ffffff';
          ctx.beginPath();
          ctx.arc(pinX, pinY - 8, 3, 0, Math.PI * 2);
          ctx.fill();
          
          // Coordinates below map
          ctx.font = `bold ${Math.floor(smallFontSize * 0.9)}px 'Inter', sans-serif`;
          ctx.fillStyle = '#1e40af';
          ctx.textAlign = 'center';
          ctx.fillText(`${lat.toFixed(6)}, ${lng.toFixed(6)}`, mapX + mapSize / 2, mapY + mapSize + smallFontSize + 4);

          finalize();
        };

        // Map provider: Geoapify Static Maps (free tier: 3000/day)
        const lat = location.latitude;
        const lng = location.longitude;
        mapImg.src = `https://maps.geoapify.com/v1/staticmap?style=osm-carto&width=300&height=300&center=lonlat:${lng},${lat}&zoom=16&marker=lonlat:${lng},${lat};color:%23dc2626;size:medium&apiKey=3f10ba2b05f44705be7bdd72e00b8f78`;
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

// helper – draw logo watermark at specific position
async function drawLogoWatermarkAt(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  logoSize: number,
): Promise<void> {
  return new Promise((resolve) => {
    const logo = new Image();
    logo.crossOrigin = 'anonymous';

    logo.onload = () => {
      // Save context state
      ctx.save();

      // Draw semi-transparent logo
      ctx.globalAlpha = 0.85;

      // Draw circular background
      ctx.beginPath();
      ctx.arc(x + logoSize / 2, y + logoSize / 2, logoSize / 2 + 2, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
      ctx.fill();

      // Draw logo
      ctx.drawImage(logo, x, y, logoSize, logoSize);

      // Restore context
      ctx.restore();
      resolve();
    };

    logo.onerror = () => {
      // Silently fail if logo can't load
      resolve();
    };

    logo.src = '/logo.png';
  });
}
