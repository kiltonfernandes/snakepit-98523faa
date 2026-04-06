import { supabase } from '@/integrations/supabase/client';
import heavynautaLogo from '@/assets/heavynauta-badge.svg';

export function drawWrappedText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
  maxLines: number
) {
  const words = text.split(' ');
  const lines: string[] = [];
  let currentLine = words[0] || '';

  for (let i = 1; i < words.length; i++) {
    const word = words[i];
    const testLine = `${currentLine} ${word}`;
    const metrics = ctx.measureText(testLine);
    if (metrics.width <= maxWidth) {
      currentLine = testLine;
    } else {
      lines.push(currentLine);
      currentLine = word;
    }
  }
  if (currentLine) lines.push(currentLine);

  const visibleLines = lines.slice(0, maxLines).map((line, index, arr) => {
    if (index !== arr.length - 1 || lines.length <= maxLines) return line;
    let trimmed = line;
    while (ctx.measureText(`${trimmed}…`).width > maxWidth && trimmed.length > 0) {
      trimmed = trimmed.slice(0, -1).trim();
    }
    return `${trimmed}…`;
  });

  visibleLines.forEach((line, index) => {
    ctx.fillText(line, x, y + index * lineHeight);
  });
}

export async function fetchCanvasSafeImageUrl(url: string): Promise<{ src: string; revoke: () => void }> {
  try {
    const edgeUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/fetch-remote-image`;
    const resp = await fetch(edgeUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
      },
      body: JSON.stringify({ url }),
    });

    if (!resp.ok) throw new Error(`Proxy error: ${resp.status}`);
    const blob = await resp.blob();
    const objectUrl = URL.createObjectURL(blob);
    return { src: objectUrl, revoke: () => URL.revokeObjectURL(objectUrl) };
  } catch {
    return { src: url, revoke: () => {} };
  }
}

export interface CoverGeneratorOptions {
  imageUrl: string;
  title: string;
  onComplete: (dataUrl: string) => void;
  onError: (error: string) => void;
}

export async function generateCoverImage({ imageUrl, title, onComplete, onError }: CoverGeneratorOptions) {
  const SIZE = 3000;
  const canvas = document.createElement('canvas');
  canvas.width = SIZE;
  canvas.height = SIZE;
  const ctx = canvas.getContext('2d');
  if (!ctx) { onError('Canvas não disponível'); return; }

  ctx.fillStyle = '#1a0e2e';
  ctx.fillRect(0, 0, SIZE, SIZE);

  const exportCover = () => {
    try {
      const dataUrl = canvas.toDataURL('image/png');
      onComplete(dataUrl);
    } catch (error) {
      onError('A capa não pôde ser exportada. Tente outra imagem.');
    }
  };

  const drawCoverImage = (img: HTMLImageElement) => {
    const frameMargin = 80;
    const frameTop = 40;
    const imageAreaW = SIZE - frameMargin * 2;
    const imageAreaH = Math.round(SIZE * 0.62);

    ctx.strokeStyle = 'rgba(200, 200, 200, 0.15)';
    ctx.lineWidth = 3;
    const clipInset = 30;
    const cornerCut = 60;
    ctx.beginPath();
    ctx.moveTo(frameMargin + cornerCut, frameTop + clipInset);
    ctx.lineTo(SIZE - frameMargin - cornerCut, frameTop + clipInset);
    ctx.lineTo(SIZE - frameMargin - clipInset, frameTop + cornerCut);
    ctx.lineTo(SIZE - frameMargin - clipInset, frameTop + imageAreaH - cornerCut);
    ctx.lineTo(SIZE - frameMargin - cornerCut, frameTop + imageAreaH - clipInset);
    ctx.lineTo(frameMargin + cornerCut, frameTop + imageAreaH - clipInset);
    ctx.lineTo(frameMargin + clipInset, frameTop + imageAreaH - cornerCut);
    ctx.lineTo(frameMargin + clipInset, frameTop + cornerCut);
    ctx.closePath();
    ctx.stroke();

    ctx.save();
    ctx.clip();

    // Always cover-fill the frame — no cropping artifacts
    const imageRatio = img.width / img.height;
    const targetRatio = imageAreaW / imageAreaH;
    let drawWidth: number;
    let drawHeight: number;
    let offsetX: number;
    let offsetY: number;

    if (imageRatio > targetRatio) {
      // Image is wider than target: match height, center horizontally
      drawHeight = imageAreaH;
      drawWidth = drawHeight * imageRatio;
      offsetX = frameMargin - (drawWidth - imageAreaW) / 2;
      offsetY = frameTop;
    } else {
      // Image is taller than target: match width, center vertically
      drawWidth = imageAreaW;
      drawHeight = drawWidth / imageRatio;
      offsetX = frameMargin;
      offsetY = frameTop - (drawHeight - imageAreaH) / 2;
    }

    ctx.drawImage(img, offsetX, offsetY, drawWidth, drawHeight);
    ctx.restore();
  };

  const drawOverlay = () => {
    const imageAreaH = Math.round(SIZE * 0.62);
    const panelTop = imageAreaH + 80;

    const grad = ctx.createLinearGradient(0, panelTop - 200, 0, panelTop + 100);
    grad.addColorStop(0, 'rgba(26, 14, 46, 0)');
    grad.addColorStop(1, 'rgba(26, 14, 46, 0.98)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, panelTop - 200, SIZE, 400);

    ctx.fillStyle = 'rgba(220, 210, 230, 0.95)';
    ctx.fillRect(0, panelTop + 100, SIZE, SIZE - panelTop - 100);

    ctx.fillStyle = '#8a8a8a';
    ctx.fillRect(0, panelTop + 100, SIZE, 20);

    const labelY = panelTop + 200;
    ctx.fillStyle = '#C8A2C8';
    ctx.fillRect(100, labelY - 60, 620, 90);
    ctx.fillStyle = '#1a0e2e';
    ctx.font = 'bold 72px sans-serif';
    ctx.fillText('Heavynauta', 120, labelY + 8);

    ctx.fillStyle = '#4a1a7a';
    ctx.font = 'bold 100px sans-serif';
    drawWrappedText(ctx, title, 100, panelTop + 420, 2100, 120, 3);

    ctx.fillStyle = '#4a1a4a';
    ctx.fillRect(100, panelTop + 780, 1200, 12);

    ctx.fillStyle = '#3a2a4a';
    ctx.font = 'italic 58px sans-serif';
    ctx.fillText('Papo Sério Sobre Música Pesada', 100 + 800, panelTop + 870);

    ctx.fillStyle = '#4a1a5e';
    ctx.fillRect(0, panelTop + 100, 16, SIZE - panelTop - 100);

    const logo = new window.Image();
    logo.onload = () => {
      const logoSize = 580;
      ctx.drawImage(logo, SIZE - logoSize - 80, SIZE - logoSize - 60, logoSize, logoSize);
      exportCover();
    };
    logo.onerror = () => exportCover();
    logo.src = heavynautaLogo;
  };

  try {
    const proxiedImage = await fetchCanvasSafeImageUrl(imageUrl);
    const img = new window.Image();
    img.onload = () => {
      drawCoverImage(img);
      proxiedImage.revoke();
      drawOverlay();
    };
    img.onerror = () => {
      proxiedImage.revoke();
      onError('Não foi possível carregar essa imagem para montar a capa.');
    };
    img.src = proxiedImage.src;
  } catch (error: any) {
    onError(error.message || 'Erro ao preparar imagem da capa');
  }
}

export function buildCoverSearchQuery(title: string): string {
  const words = title
    .replace(/[^\w\sáàãâéèêíìîóòõôúùûçÁÀÃÂÉÈÊÍÌÎÓÒÕÔÚÙÛÇ]/gi, '')
    .split(/\s+/)
    .filter(w => w.length > 2)
    .slice(0, 4)
    .join(' ');
  return `${words} band promo`;
}
