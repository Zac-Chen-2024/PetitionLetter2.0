import { useState, useEffect, useRef } from 'react';
import { pdfjs } from 'react-pdf';
import { Portal } from './Portal';
import type { BoundingBox } from '../types';

interface BBoxLightboxProps {
  pdfUrl: string;
  pageNumber: number;
  bbox: BoundingBox;
  originRect: DOMRect;
  snippetColor: string;
  onTransitionEnd?: () => void;
  isLeaving?: boolean;
}

// Cache high-res rendered page canvases (keyed by url:page)
const pageCanvasCache = new Map<string, HTMLCanvasElement>();
const RENDER_SCALE = 3;

async function renderPageHighRes(pdfUrl: string, pageNumber: number): Promise<HTMLCanvasElement> {
  const key = `${pdfUrl}:${pageNumber}`;
  const cached = pageCanvasCache.get(key);
  if (cached) return cached;

  const doc = await pdfjs.getDocument(pdfUrl).promise;
  const page = await doc.getPage(pageNumber);
  const viewport = page.getViewport({ scale: RENDER_SCALE });
  const canvas = document.createElement('canvas');
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  const ctx = canvas.getContext('2d')!;
  await page.render({ canvasContext: ctx, viewport }).promise;
  pageCanvasCache.set(key, canvas);
  return canvas;
}

function cropBbox(canvas: HTMLCanvasElement, bbox: BoundingBox) {
  const cw = canvas.width;
  const ch = canvas.height;
  const padFrac = 0.02;

  let sx = (bbox.x / 1000) * cw;
  let sy = (bbox.y / 1000) * ch;
  let sw = (bbox.width / 1000) * cw;
  let sh = (bbox.height / 1000) * ch;

  // Expand by 2% padding (clamped to canvas bounds)
  const padX = sw * padFrac;
  const padY = sh * padFrac;
  sx = Math.max(0, sx - padX);
  sy = Math.max(0, sy - padY);
  sw = Math.min(cw - sx, sw + padX * 2);
  sh = Math.min(ch - sy, sh + padY * 2);

  const offscreen = document.createElement('canvas');
  offscreen.width = sw;
  offscreen.height = sh;
  const ctx = offscreen.getContext('2d')!;
  ctx.drawImage(canvas, sx, sy, sw, sh, 0, 0, sw, sh);
  return { url: offscreen.toDataURL('image/png'), width: sw, height: sh };
}

export function BBoxLightbox({
  pdfUrl,
  pageNumber,
  bbox,
  originRect,
  snippetColor,
  onTransitionEnd,
  isLeaving = false,
}: BBoxLightboxProps) {
  const [cropped, setCropped] = useState<{ url: string; width: number; height: number } | null>(null);
  const [animPhase, setAnimPhase] = useState<'initial' | 'entered'>('initial');
  const imgRef = useRef<HTMLDivElement>(null);

  // Render page at high resolution from source PDF, then crop bbox
  useEffect(() => {
    let cancelled = false;
    renderPageHighRes(pdfUrl, pageNumber).then((canvas) => {
      if (cancelled) return;
      try {
        setCropped(cropBbox(canvas, bbox));
      } catch {
        // canvas security error etc.
      }
    });
    return () => { cancelled = true; };
  }, [pdfUrl, pageNumber, bbox]);

  // Two-frame enter animation — start after crop is ready
  useEffect(() => {
    if (!cropped || isLeaving) return;
    const id = requestAnimationFrame(() => setAnimPhase('entered'));
    return () => cancelAnimationFrame(id);
  }, [cropped, isLeaving]);

  // If leaving before crop is ready, just cleanup immediately
  useEffect(() => {
    if (isLeaving && !cropped && onTransitionEnd) {
      onTransitionEnd();
    }
  }, [isLeaving, cropped, onTransitionEnd]);

  if (!cropped) return null;

  // Target display size: use native pixel width (already 3x), capped by viewport
  const aspectRatio = cropped.width / cropped.height;
  const maxW = window.innerWidth * 0.6;
  const maxH = window.innerHeight * 0.6;
  let targetW = Math.min(cropped.width, maxW);
  let targetH = targetW / aspectRatio;

  if (targetH > maxH) {
    targetH = maxH;
    targetW = targetH * aspectRatio;
  }
  // Ensure minimum size for very small bboxes
  if (targetW < 200) {
    targetW = Math.min(200, maxW);
    targetH = targetW / aspectRatio;
  }

  const isAtOrigin = animPhase === 'initial' || isLeaving;

  const style: React.CSSProperties = isAtOrigin
    ? {
        position: 'fixed',
        left: originRect.left,
        top: originRect.top,
        width: originRect.width,
        height: originRect.height,
        opacity: 0,
        zIndex: 50,
        pointerEvents: 'none',
        transition: 'all 300ms cubic-bezier(0.32, 0.72, 0, 1)',
        borderRadius: 4,
      }
    : {
        position: 'fixed',
        left: (window.innerWidth - targetW) / 2,
        top: (window.innerHeight - targetH) / 2,
        width: targetW,
        height: targetH,
        opacity: 1,
        zIndex: 50,
        pointerEvents: 'none',
        transition: 'all 300ms cubic-bezier(0.32, 0.72, 0, 1)',
        borderRadius: 4,
      };

  return (
    <Portal>
      <div
        ref={imgRef}
        style={style}
        onTransitionEnd={(e) => {
          if (e.propertyName === 'opacity' && isLeaving && onTransitionEnd) {
            onTransitionEnd();
          }
        }}
      >
        <img
          src={cropped.url}
          alt="bbox preview"
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'fill',
            border: `3px solid ${snippetColor}`,
            borderRadius: 4,
            boxShadow: '0 12px 40px rgba(0,0,0,0.35), 0 0 0 1px rgba(0,0,0,0.08)',
            display: 'block',
          }}
          draggable={false}
        />
      </div>
    </Portal>
  );
}
